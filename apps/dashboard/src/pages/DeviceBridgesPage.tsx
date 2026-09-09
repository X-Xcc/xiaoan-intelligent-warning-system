import { Alert, App, Button, Empty, Form, Input, InputNumber, Modal, Segmented, Select, Space, Switch, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Activity, Cable, Edit3, FlaskConical, Link2, LockKeyhole, Plus, Power, RefreshCw, RotateCw, Save, Search, Square, Trash2, Unlink, Video } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { BridgeLogin, BridgePreview } from '../components/BridgePreview';
import {
  bridgeDeviceAddress, bridgeEditorPath, bridgeErrorMessage, bridgeKindLabels, bridgeModeFields, bridgeStageLabel, bridgeStatusLabels, controlBridge, deleteBridge, frameTime,
  getBridgeInventory, hasFreshFrame, isHttpBridge, isRtspBridge, redactBridgeMessage, rtspTemplate, saveBridge, saveBridgeBindings,
  testBridge, useBridgeInventory, validateDeviceInput,
  type BridgeDevice, type BridgeKind, type BridgeStatus, type BridgeTestResult, type DeviceInput,
} from '../lib/device-bridges-api';
import { routePath } from '../lib/presentation';
import '../styles/device-bridges.css';

const kindOptions = Object.entries(bridgeKindLabels).map(([value, label]) => ({ value, label }));
const statusOptions = Object.entries(bridgeStatusLabels).map(([value, label]) => ({ value, label }));
const initialDevice: DeviceInput = { name: '', kind: 'rtsp', host: '', port: 554, username: '', rtspPath: '', channel: 1, stream: 'main', go2Mode: 'LocalSTA', usbIndex: 0, httpScheme: 'http', httpPath: '', autoStart: false };
const operationLabels = { start: '启动', stop: '停止', restart: '重启', test: '测试连接', delete: '删除' } as const;
type Operation = keyof typeof operationLabels;

function timestamp(value: string | number | null | undefined): string {
  const time = frameTime(value ?? null);
  return Number.isFinite(time) ? new Date(time).toLocaleString('zh-CN', { hour12: false }) : '未记录';
}
function number(value: number | null | undefined, suffix = ''): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Number(value.toFixed(1))}${suffix}` : '未测得';
}
function DeviceStatus({ device, available, now }: { device: BridgeDevice; available: boolean; now: number }) {
  const fresh = hasFreshFrame(device, now);
  const color = !available ? 'default' : fresh ? 'green' : device.status === 'error' ? 'red' : device.status === 'stopped' ? 'default' : 'gold';
  return <Tag color={color}>{!available ? '状态未确认' : device.status === 'online' && !fresh ? '画面过期' : bridgeStatusLabels[device.status]}</Tag>;
}

function DeviceEditor({ device, busy, close, save }: { device?: BridgeDevice; busy: boolean; close: () => void; save: (input: DeviceInput) => Promise<void> }) {
  const [form] = Form.useForm<DeviceInput>();
  const initialPath = bridgeEditorPath(device);
  const [customPath, setCustomPath] = useState(initialPath.customPath);
  const [error, setError] = useState('');
  const kind = Form.useWatch('kind', form) ?? device?.kind ?? 'rtsp';
  const go2Mode = Form.useWatch('go2Mode', form) ?? device?.go2Mode ?? 'LocalSTA';
  const values: DeviceInput = device ? {
    name: device.name, kind: device.kind, host: device.host, port: device.port, username: device.username,
    rtspPath: initialPath.rtspPath, channel: device.channel, stream: device.stream, go2Mode: device.go2Mode,
    usbIndex: device.usbIndex ?? 0, httpScheme: device.httpScheme ?? 'http', httpPath: device.httpPath ?? '',
    autoStart: device.autoStart,
  } : initialDevice;

  const submit = async (submitted: DeviceInput) => {
    const input: DeviceInput = { ...initialDevice, ...form.getFieldsValue(true), ...submitted };
    const errors = validateDeviceInput(input);
    if (Object.keys(errors).length) {
      form.setFields(Object.entries(errors).map(([name, value]) => ({ name: name as keyof DeviceInput, errors: [value] })));
      return;
    }
    setError('');
    form.setFieldValue('password', '');
    try { await save(input); } catch (failure) { setError(bridgeErrorMessage(failure)); }
  };
  const applyTemplate = () => {
    const current = form.getFieldsValue(true);
    form.setFieldValue('rtspPath', rtspTemplate(current.kind, current.channel, current.stream));
  };
  const closeEditor = () => {
    form.setFieldValue('password', '');
    close();
  };

  return <Modal open title={device ? '编辑设备' : '添加设备'} onCancel={busy ? undefined : closeEditor} closable={!busy} maskClosable={false} destroyOnHidden
    width={660} className="bridge-editor" footer={<Space><Button disabled={busy} onClick={closeEditor}>取消</Button><Button type="primary" loading={busy} icon={<Save size={15} />} onClick={() => form.submit()}>保存设备</Button></Space>}>
    {error && <Alert type="error" showIcon title={error} />}
    <Form form={form} layout="vertical" initialValues={values} disabled={busy} onFinish={submit}
      onValuesChange={(changed: Partial<DeviceInput>, all: DeviceInput) => {
        const next = bridgeModeFields(all, changed);
        if (changed.kind) {
          setCustomPath(changed.kind === 'rtsp');
        } else if (isRtspBridge(all.kind) && !customPath && (changed.channel || changed.stream)) {
          next.rtspPath = rtspTemplate(all.kind, all.channel, all.stream);
        }
        if (Object.keys(next).length) form.setFieldsValue(next);
      }}>
      <div className="bridge-form-grid">
        <Form.Item name="name" label="设备名称" rules={[{ required: true, whitespace: true, max: 80, message: '请输入 1 至 80 字的设备名称' }]}><Input maxLength={80} autoComplete="off" /></Form.Item>
        <Form.Item name="kind" label="设备类型" rules={[{ required: true }]}><Select options={kindOptions} /></Form.Item>
        {kind === 'usb' && <Form.Item name="usbIndex" label="USB 设备序号" rules={[{ required: true, type: 'integer', min: 0, max: 15, message: 'USB 设备序号范围为 0 至 15' }]}><InputNumber min={0} max={15} precision={0} /></Form.Item>}
        {kind !== 'usb' && <Form.Item name="host" label="IP / 主机名" rules={[{ required: true, whitespace: true, message: '请输入 IP 或主机名' }]}><Input autoComplete="off" placeholder="192.0.2.10" readOnly={kind === 'go2' && go2Mode === 'LocalAP'} /></Form.Item>}
        {isHttpBridge(kind) && <Form.Item name="httpScheme" label="HTTP 协议" rules={[{ required: true, message: '请选择 HTTP 或 HTTPS' }]}><Segmented options={[{ value: 'http', label: 'HTTP' }, { value: 'https', label: 'HTTPS' }]} /></Form.Item>}
        {kind !== 'usb' && kind !== 'go2' && <>
          <Form.Item name="port" label={isHttpBridge(kind) ? 'HTTP 端口' : 'RTSP 端口'} rules={[{ required: true, type: 'integer', min: 1, max: 65535, message: '端口范围为 1 至 65535' }]}><InputNumber min={1} max={65535} precision={0} /></Form.Item>
          <Form.Item name="username" label="设备用户名"><Input autoComplete="off" maxLength={128} /></Form.Item>
          <Form.Item name="password" label="设备密码" preserve={false}><Input.Password autoComplete="new-password" placeholder={kind === device?.kind && device?.hasPassword ? '已配置，留空保留原密码' : '未配置密码'} /></Form.Item>
        </>}
        {kind === 'go2' && <Form.Item name="go2Mode" label="Go2 连接模式" rules={[{ required: true }]}><Select options={[{ value: 'LocalSTA', label: 'LocalSTA' }, { value: 'LocalAP', label: 'LocalAP' }]} /></Form.Item>}
        {isHttpBridge(kind) && <div className="bridge-path-field">
          <Form.Item name="httpPath" label={kind === 'http_snapshot' ? 'HTTP 快照路径' : 'HTTP MJPEG 路径'} rules={[{ required: true, message: '请输入以 / 开头的 HTTP 路径' }]}>
            <Input autoComplete="off" placeholder={kind === 'http_snapshot' ? '/snapshot.jpg' : '/video_feed'} maxLength={2048} />
          </Form.Item>
        </div>}
        {isRtspBridge(kind) && <>
          <Form.Item name="channel" label="视频通道" rules={[{ required: true, type: 'integer', min: 1, max: 256, message: '通道范围为 1 至 256' }]}><InputNumber min={1} max={256} precision={0} /></Form.Item>
          <Form.Item name="stream" label="码流"><Segmented options={[{ label: '主码流', value: 'main' }, { label: '子码流', value: 'sub' }]} /></Form.Item>
          <div className="bridge-path-field">
            <Segmented aria-label="RTSP 路径模式" value={kind === 'rtsp' || customPath ? 'custom' : 'template'}
              options={[{ value: 'template', label: '品牌模板', disabled: kind === 'rtsp' }, { value: 'custom', label: '自定义路径' }]}
              onChange={(value: string | number) => { setCustomPath(value === 'custom'); if (value === 'template') applyTemplate(); }} />
            <Form.Item name="rtspPath" label="RTSP 路径" rules={[{ required: true, message: '请输入 RTSP 路径' }]}><Input readOnly={kind !== 'rtsp' && !customPath} placeholder="/live" autoComplete="off" /></Form.Item>
          </div>
        </>}
        <Form.Item name="autoStart" label="服务启动时自动连接" valuePropName="checked"><Switch /></Form.Item>
      </div>
      {kind === 'go2' && <Tag>Go2 摄像头视频接入</Tag>}
    </Form>
  </Modal>;
}

export function DeviceBridgesPage() {
  const bridge = useBridgeInventory();
  const { message, modal } = App.useApp();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<BridgeKind | 'all'>('all');
  const [status, setStatus] = useState<BridgeStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('device') ?? '');
  const [editor, setEditor] = useState<{ device?: BridgeDevice } | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; result: BridgeTestResult } | null>(null);
  const [bindingDraft, setBindingDraft] = useState<Array<string | null> | null>(null);
  const [bindingBase, setBindingBase] = useState<Array<string | null> | null>(null);
  const devices = bridge.inventory?.items ?? [];
  const selected = devices.find((device) => device.id === selectedId);
  const bindings = bridge.inventory?.bindings ?? Array<string | null>(16).fill(null);
  const draft = bindingDraft ?? bindings;
  const dirty = Boolean(bindingDraft && JSON.stringify(bindingDraft) !== JSON.stringify(bindings));
  const conflict = Boolean(bindingBase && JSON.stringify(bindingBase) !== JSON.stringify(bindings));
  const disabled = bridge.busy || !bridge.available;

  useEffect(() => {
    const previous = document.title;
    document.title = '设备桥接管理';
    const sync = () => setSelectedId(new URLSearchParams(window.location.search).get('device') ?? '');
    window.addEventListener('popstate', sync);
    return () => { document.title = previous; window.removeEventListener('popstate', sync); };
  }, []);

  const selectDevice = (id: string) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('device', id);
    else url.searchParams.delete('device');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };
  const filtered = useMemo(() => devices.filter((device) =>
    (!query.trim() || device.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    && (kind === 'all' || device.kind === kind) && (status === 'all' || device.status === status),
  ), [bridge.inventory, query, kind, status]);

  const confirmOperation = (device: BridgeDevice, action: Operation) => {
    const label = operationLabels[action];
    const count = bindings.filter((id) => id === device.id).length;
    modal.confirm({
      title: `${label}「${device.name}」？`,
      content: action === 'delete' ? `设备配置将删除${count ? `，并解除 ${count} 个视频槽位的绑定` : ''}。` : action === 'test' ? '将执行实际连接检测，可能短暂占用设备的视频连接。' : action === 'stop' || action === 'restart' ? '当前设备的实时画面将中断。' : '将连接该设备的视频源。',
      okText: label, cancelText: '取消', okButtonProps: { danger: action === 'delete' || action === 'stop' },
      onOk: async () => {
        try {
          await bridge.mutate(async (signal) => {
            if (action === 'delete') {
              const result = await deleteBridge(device.id, signal);
              if (result.deleted !== true) throw new Error('服务端未确认删除结果');
              selectDevice('');
              setBindingDraft(null);
              setBindingBase(null);
              setTestResult(null);
            } else if (action === 'test') {
              const result = await testBridge(device.id, signal);
              if (!Array.isArray(result.checks) || result.device?.id !== device.id) throw new Error('检测返回格式不完整');
              setTestResult({ id: device.id, result });
              return;
            } else {
              const result = await controlBridge(device.id, action, signal);
              if (result.device?.id !== device.id) throw new Error('服务端未确认设备操作结果');
            }
          });
          if (action !== 'test') message.success(action === 'delete' ? '设备已删除' : `${label}请求已确认，正在同步状态`);
        } catch (failure) { message.error(bridgeErrorMessage(failure)); throw failure; }
      },
    });
  };
  const saveDevice = async (input: DeviceInput) => {
    await bridge.mutate(async (signal) => {
      const payload = await saveBridge(input, editor?.device?.id, signal, editor?.device?.kind);
      if (!payload.device?.id) throw new Error('服务端未确认设备保存结果');
      selectDevice(payload.device.id);
      setEditor(null);
      message.success('设备配置已保存');
    });
  };
  const changeBinding = (index: number, id: string | null) => {
    if (!bindingBase) setBindingBase([...bindings]);
    setBindingDraft(draft.map((value, slot) => slot === index ? id : value));
  };
  const persistBindings = () => {
    const submitted = [...draft];
    const baseline = [...(bindingBase ?? bindings)];
    modal.confirm({
      title: '保存视频槽位绑定？', content: '视频墙将使用新的固定分配，已更换来源的旧画面会被清除。', okText: '保存绑定', cancelText: '取消',
      onOk: async () => {
        try {
          await bridge.mutate(async (signal) => {
            const latest = await getBridgeInventory(signal);
            if (JSON.stringify(latest.bindings) !== JSON.stringify(baseline)) throw new Error('槽位已被其他会话修改，请重新读取后再保存');
            if (submitted.some((id) => id && !latest.items.some((item) => item.id === id))) throw new Error('绑定中的设备已被删除，请重新选择');
            await saveBridgeBindings(submitted, signal);
            setBindingDraft(null);
            setBindingBase(null);
          });
          message.success('视频槽位绑定已保存');
        } catch (failure) { message.error(bridgeErrorMessage(failure)); throw failure; }
      },
    });
  };

  const columns: ColumnsType<BridgeDevice> = [
    { title: '设备', key: 'name', width: 210, render: (_, device) => <button className="bridge-device-name" onClick={() => selectDevice(device.id)} aria-pressed={selectedId === device.id}><strong>{device.name}</strong><small>{bridgeDeviceAddress(device)}</small></button> },
    { title: '类型', key: 'kind', width: 120, render: (_, device) => bridgeKindLabels[device.kind] },
    { title: '状态', key: 'status', width: 125, render: (_, device) => <DeviceStatus device={device} available={bridge.available} now={bridge.now} /> },
    { title: '槽位', key: 'slots', width: 100, render: (_, device) => bindings.flatMap((id, index) => id === device.id ? [String(index + 1).padStart(2, '0')] : []).join(', ') || '未绑定' },
  ];
  const result = selected && testResult?.id === selected.id ? testResult.result : null;

  return <section className="device-bridges-page">
    <header className="bridge-page-heading">
      <div><h1><Cable size={23} />设备桥接</h1><span className="bridge-muted">最近同步 {bridge.updatedAt ? timestamp(bridge.updatedAt) : '尚未连接'}</span></div>
      <Space wrap>
        <Button icon={<Video size={15} />} onClick={() => { window.history.pushState({}, '', routePath('video')); window.dispatchEvent(new PopStateEvent('popstate')); }}>视频联动</Button>
        {bridge.auth?.enabled && !bridge.authRequired && <Tooltip title="锁定管理与预览访问"><Button aria-label="锁定访问" disabled={bridge.busy} icon={<LockKeyhole size={15} />} onClick={() => void bridge.lock().catch((error) => message.error(`本地已锁定；${bridgeErrorMessage(error)}`))} /></Tooltip>}
        <Tooltip title="刷新设备状态"><Button aria-label="刷新设备状态" icon={<RefreshCw size={16} />} loading={bridge.refreshing} disabled={bridge.busy} onClick={bridge.refresh} /></Tooltip>
        <Button type="primary" icon={<Plus size={16} />} disabled={disabled} onClick={() => setEditor({})}>添加设备</Button>
      </Space>
    </header>
    {bridge.authRequired ? <BridgeLogin login={bridge.login} busy={bridge.busy} tokenConfigured={bridge.auth?.tokenConfigured} /> : <>
      {(bridge.error || (bridge.updatedAt > 0 && !bridge.available)) && <Alert type="warning" showIcon title={bridge.error || '状态已过期，等待重新同步'} description={bridge.inventory ? '当前清单为上次读取结果，视频预览已暂停。' : undefined} />}
      <div className="bridge-runtime" aria-label="桥接运行环境">
        <span><Activity size={15} />{bridge.available ? '管理服务已连接' : '管理服务未确认'}</span>
        <span>运行 <b>{bridge.available ? `${bridge.inventory?.runtime.running} / ${bridge.inventory?.runtime.maxDevices}` : '未读取'}</b></span>
        {(['av', 'opencv', 'go2'] as const).map((key) => <span key={key}>{key === 'av' ? 'PyAV' : key === 'opencv' ? 'OpenCV' : 'Go2'} <Tag color={!bridge.available ? 'default' : bridge.inventory?.runtime[key] ? 'green' : 'gold'}>{!bridge.available ? '未读取' : bridge.inventory?.runtime[key] ? '可用' : '未安装'}</Tag></span>)}
      </div>
      <div className="bridge-main-grid">
        <section className="bridge-inventory" aria-labelledby="bridge-inventory-title">
          <header className="bridge-section-heading"><h2 id="bridge-inventory-title">设备清单</h2><span className="bridge-muted">{filtered.length} / {devices.length}</span></header>
          <div className="bridge-filters">
            <Input aria-label="搜索设备名称" allowClear prefix={<Search size={15} />} placeholder="搜索设备名称" value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} />
            <Select aria-label="筛选设备类型" value={kind} onChange={setKind} options={[{ value: 'all', label: '全部类型' }, ...kindOptions]} />
            <Select aria-label="筛选设备状态" value={status} onChange={setStatus} options={[{ value: 'all', label: '全部状态' }, ...statusOptions]} />
          </div>
          <Table<BridgeDevice> rowKey="id" size="small" columns={columns} dataSource={filtered} loading={bridge.refreshing && !bridge.inventory}
            rowClassName={(device: BridgeDevice) => device.id === selectedId ? 'bridge-row-selected' : ''} scroll={{ x: 555 }}
            pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={!bridge.inventory ? '设备清单尚未读取' : devices.length ? '没有匹配的设备' : '尚未添加设备'} /> }} />
        </section>
        <section className="bridge-detail" aria-labelledby="bridge-detail-title">
          <header className="bridge-section-heading"><h2 id="bridge-detail-title">{selected?.name ?? '当前设备'}</h2>{selected && <DeviceStatus device={selected} available={bridge.available} now={bridge.now} />}</header>
          {selected ? <>
            <div className="bridge-device-actions">
              <Tooltip title="编辑设备"><Button aria-label="编辑设备" disabled={disabled} icon={<Edit3 size={15} />} onClick={() => setEditor({ device: selected })} /></Tooltip>
              <Button disabled={disabled || ['online', 'connecting', 'reconnecting'].includes(selected.status)} icon={<Power size={15} />} onClick={() => confirmOperation(selected, 'start')}>启动</Button>
              <Button disabled={disabled || selected.status === 'stopped'} icon={<Square size={14} />} onClick={() => confirmOperation(selected, 'stop')}>停止</Button>
              <Tooltip title="重启设备桥接"><Button aria-label="重启设备桥接" disabled={disabled} icon={<RotateCw size={15} />} onClick={() => confirmOperation(selected, 'restart')} /></Tooltip>
              <Button disabled={disabled} icon={<FlaskConical size={15} />} onClick={() => confirmOperation(selected, 'test')}>测试连接</Button>
              <Tooltip title="删除设备"><Button aria-label="删除设备" danger disabled={disabled} icon={<Trash2 size={15} />} onClick={() => confirmOperation(selected, 'delete')} /></Tooltip>
            </div>
            <BridgePreview device={selected} available={bridge.available && !bridge.busy} authorized={bridge.previewReady} epoch={bridge.previewEpoch} />
            <dl className="bridge-measurements">
              <div><dt>解码帧率</dt><dd>{bridge.available && hasFreshFrame(selected, bridge.now) ? number(selected.fps, ' fps') : '未测得'}</dd></div>
              <div><dt>分辨率</dt><dd>{bridge.available && selected.width && selected.height ? `${selected.width} × ${selected.height}` : '未测得'}</dd></div>
              <div><dt>接收帧数</dt><dd>{number(selected.frameCount)}</dd></div>
              <div><dt>最近帧</dt><dd>{timestamp(selected.lastFrameAt)}</dd></div>
              <div><dt>连接阶段</dt><dd>{bridgeStageLabel(selected.stage)}</dd></div>
              <div><dt>{selected.kind === 'go2' ? '连接模式' : selected.kind === 'usb' ? 'USB 设备序号' : '设备凭据'}</dt><dd>{selected.kind === 'go2' ? selected.go2Mode : selected.kind === 'usb' ? `#${selected.usbIndex ?? 0}` : selected.hasPassword ? '已配置' : '未配置密码'}</dd></div>
              <div><dt>接入方式</dt><dd>{bridgeKindLabels[selected.kind]}</dd></div>
              <div><dt>设备地址</dt><dd>{bridgeDeviceAddress(selected)}</dd></div>
              {isHttpBridge(selected.kind) && <div><dt>HTTP 路径</dt><dd>{selected.httpPath || '未配置'}</dd></div>}
            </dl>
            {selected.lastError && <Alert type="error" showIcon title={redactBridgeMessage(selected.lastError)} />}
            {result && <section className="bridge-diagnostics" aria-label="最近连接检测">
              <header className="bridge-section-heading"><h3>最近连接检测</h3><Tag color={result.ok ? 'green' : 'red'}>{result.ok ? '检测通过' : '检测未通过'}</Tag></header>
              {result.checks.map((check, index) => <div className="bridge-check" key={`${check.stage}-${index}`}><Tag color={check.ok ? 'green' : 'red'}>{check.ok ? '通过' : '失败'}</Tag><strong>{bridgeStageLabel(check.stage)}</strong><span>{redactBridgeMessage(check.message)}</span></div>)}
              {!result.checks.length && <span className="bridge-muted">服务端未返回检测步骤</span>}
            </section>}
            <section className="bridge-log-section" aria-label="设备最新日志"><header className="bridge-section-heading"><h3>最新日志</h3><span className="bridge-muted">{selected.logs?.length ?? 0} 条</span></header>
              <ol className="bridge-logs">{(selected.logs ?? []).slice(-40).reverse().map((log, index) => <li key={`${log.at}-${index}`}><time>{timestamp(log.at)}</time><Tag color={log.level === 'error' ? 'red' : log.level === 'warning' ? 'gold' : 'default'}>{log.level}</Tag><span>{redactBridgeMessage(log.message)}</span></li>)}</ol>
              {!selected.logs?.length && <p className="bridge-muted">暂无日志</p>}
            </section>
          </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedId && bridge.inventory ? '所选设备已移除或不可见' : '尚未选择设备'} />}
        </section>
      </div>
      <section className="bridge-bindings" aria-labelledby="bridge-bindings-title">
        <header className="bridge-section-heading"><h2 id="bridge-bindings-title"><Link2 size={17} />视频槽位</h2><Space wrap>
          {dirty && <Button disabled={bridge.busy} onClick={() => { setBindingDraft(null); setBindingBase(null); }}>撤销更改</Button>}
          <Button type="primary" icon={<Save size={15} />} disabled={disabled || !dirty || conflict} onClick={persistBindings}>保存绑定</Button>
        </Space></header>
        {conflict && <Alert type="warning" showIcon title="槽位已被其他会话修改" action={<Button size="small" onClick={() => { setBindingDraft(null); setBindingBase(null); }}>读取最新绑定</Button>} />}
        <div className="bridge-slot-grid">{draft.map((id, index) => <div className="bridge-slot" key={index}>
          <label htmlFor={`bridge-slot-${index}`}>槽位 {String(index + 1).padStart(2, '0')}</label>
          <Select id={`bridge-slot-${index}`} aria-label={`槽位 ${index + 1} 设备`} showSearch optionFilterProp="label" allowClear disabled={disabled}
            placeholder="未绑定" value={id ?? undefined} onChange={(value: string | undefined) => changeBinding(index, value ?? null)}
            options={[...devices.map((device) => ({ value: device.id, label: device.name })), ...(id && !devices.some((device) => device.id === id) ? [{ value: id, label: '设备已移除' }] : [])]} />
          <Tooltip title={`解除槽位 ${index + 1} 绑定`}><Button aria-label={`解除槽位 ${index + 1} 绑定`} disabled={disabled || !id} icon={<Unlink size={14} />} onClick={() => changeBinding(index, null)} /></Tooltip>
        </div>)}</div>
      </section>
    </>}
    {editor && <DeviceEditor device={editor.device} busy={bridge.busy} close={() => setEditor(null)} save={saveDevice} />}
  </section>;
}
