import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BottomSheet, EmptyState, EventCard, Icon, PageHeader, Section } from '@/components/ui'
import { connectRealtimeEvents, fetchSecurityOpsOverview, fetchStaffTasks, updateSafetyEventStatus } from '@/utils/api'
import type { SafetyEvent, SecurityOpsOverview } from '@/types/events'
import { StaffTraining } from './StaffTraining'
import { StaffCommandMaterials } from './StaffCommandMaterials'
import {
  assignedTasks, filterStaffTasks, isAssignedTask, navigationDestination, nextTaskStatus,
  staffError, staffTaskCounts, taskTransitionError, type StaffTaskFilter,
} from './staff-model'
import './staff.scss'

type Props = { staffName: string; onExit: () => void }
type Tab = 'workbench' | 'tasks' | 'training' | 'mine'
type Feedback = { error?: string; success?: string }
const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'workbench', label: '工作台', icon: 'home' }, { id: 'tasks', label: '任务', icon: 'tasks' },
  { id: 'training', label: '训练', icon: 'book' }, { id: 'mine', label: '我的', icon: 'user' },
]
const filters: Array<{ id: StaffTaskFilter; label: string }> = [
  { id: 'all', label: '全部' }, { id: 'pending', label: '待接收' },
  { id: 'active', label: '处理中' }, { id: 'completed', label: '已完成' },
]
const actionLabels = { 已接收: '接收任务', 已到达: '确认到场', 处理中: '开始处置', 已完成: '回传处置结果' }

export function StaffWorkspace(props: Props) {
  return <StaffWorkspaceContent key={props.staffName} {...props} />
}

function StaffWorkspaceContent({ staffName, onExit }: Props) {
  const [tab, setTab] = useState<Tab>('workbench')
  const [tasks, setTasks] = useState<SafetyEvent[]>([])
  const [filter, setFilter] = useState<StaffTaskFilter>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState('')
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('')
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({})
  const draftKey = `command-staff-drafts:staff:${encodeURIComponent(staffName)}`
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const saved = Taro.getStorageSync(draftKey)
    return saved && typeof saved === 'object' ? saved : {}
  })
  const [lastSync, setLastSync] = useState('')
  const [completionId, setCompletionId] = useState('')
  const [dutyOpen, setDutyOpen] = useState(false)
  const [duty, setDuty] = useState<SecurityOpsOverview | null>(null)
  const [dutyLoading, setDutyLoading] = useState(false)
  const [dutyError, setDutyError] = useState('')
  const [exitOpen, setExitOpen] = useState(false)
  const [trainingBusy, setTrainingBusy] = useState(false)
  const mounted = useRef(true)
  const foreground = useRef(true)
  const loadVersion = useRef(0)
  const loadingRef = useRef(false)
  const operation = useRef(false)
  const taskRef = useRef(tasks)
  const dutyVersion = useRef(0)
  const dutyLoadingRef = useRef(false)
  const controlsLocked = Boolean(busy) || trainingBusy

  const load = useCallback(async () => {
    if (operation.current || loadingRef.current) return
    const version = ++loadVersion.current
    loadingRef.current = true
    setLoading(true)
    try {
      if (!staffName.trim()) throw new Error('未选择工作人员，请返回重新选择。')
      const items = await fetchStaffTasks(staffName)
      if (!Array.isArray(items)) throw new Error('任务数据格式不完整，请重试。')
      if (!mounted.current || version !== loadVersion.current) return
      const own = assignedTasks(items, staffName)
      taskRef.current = own
      setTasks(own)
      setLoaded(true)
      setLoadError('')
      setLastSync(new Date().toLocaleTimeString())
    } catch (error) {
      if (mounted.current && version === loadVersion.current) {
        setLoadError(staffError(error))
      }
    } finally {
      if (version === loadVersion.current) {
        loadingRef.current = false
        if (mounted.current) setLoading(false)
      }
    }
  }, [staffName])

  useEffect(() => { Taro.setStorageSync(draftKey, drafts) }, [draftKey, drafts])

  useEffect(() => {
    mounted.current = true
    void load()
    const disconnect = staffName.trim() ? connectRealtimeEvents(() => { if (foreground.current) void load() }) : undefined
    const timer = setInterval(() => { if (foreground.current) void load() }, 30000)
    return () => {
      mounted.current = false
      loadVersion.current++
      loadingRef.current = false
      dutyVersion.current++
      dutyLoadingRef.current = false
      disconnect?.()
      clearInterval(timer)
    }
  }, [load, staffName])
  useDidShow(() => { foreground.current = true; void load() })
  useDidHide(() => { foreground.current = false })

  const loadDuty = useCallback(async () => {
    if (dutyLoadingRef.current) return
    dutyLoadingRef.current = true
    const version = ++dutyVersion.current
    setDutyLoading(true)
    try {
      const overview = await fetchSecurityOpsOverview()
      if (overview.duty?.items && !Array.isArray(overview.duty.items)) throw new Error('值班数据格式不完整。')
      if (mounted.current && version === dutyVersion.current) {
        setDuty(overview)
        setDutyError('')
      }
    } catch (error) {
      if (mounted.current && version === dutyVersion.current) setDutyError(staffError(error))
    } finally {
      if (version === dutyVersion.current) {
        dutyLoadingRef.current = false
        if (mounted.current) setDutyLoading(false)
      }
    }
  }, [])
  const showDuty = () => { setDutyOpen(true); void loadDuty() }

  const advance = async (taskId: string, complete = false) => {
    if (operation.current || loadingRef.current || loadError) return
    const task = taskRef.current.find((item) => item.id === taskId)
    if (!task) return
    const next = nextTaskStatus(task.status)
    if (!next) return
    if (next === '已完成' && !complete) { setCompletionId(taskId); return }
    const result = next === '已完成' ? drafts[taskId]?.trim() : undefined
    const error = taskTransitionError(task, staffName, next, result)
    if (error) { setFeedback((value) => ({ ...value, [taskId]: { error } })); return }
    operation.current = true
    loadVersion.current++
    setBusy(taskId)
    setFeedback((value) => ({ ...value, [taskId]: {} }))
    try {
      const updated = await updateSafetyEventStatus(taskId, next, staffName, result, task.meta?.command?.version)
      if (!mounted.current) return
      if (updated.id !== taskId || updated.status !== next || !isAssignedTask(updated, staffName)
        || (next === '已完成' && !updated.result?.trim())) {
        throw new Error('服务未确认本次状态变更，请刷新核对；处置结果草稿已保留。')
      }
      taskRef.current = taskRef.current.map((item) => item.id === taskId ? updated : item)
      setTasks(taskRef.current)
      setFeedback((value) => ({ ...value, [taskId]: { success: `平台已确认：${updated.status}` } }))
      setExpanded(taskId)
      if (next === '已完成') setCompletionId('')
      setFilter(next === '已完成' ? 'completed' : 'active')
    } catch (cause) {
      if (mounted.current) setFeedback((value) => ({ ...value, [taskId]: { error: staffError(cause) } }))
    } finally {
      operation.current = false
      if (mounted.current) { setBusy(''); void load() }
    }
  }

  const navigate = async (task: SafetyEvent) => {
    if (operation.current) return
    const point = navigationDestination(task)
    if (!point) return
    operation.current = true
    loadVersion.current++
    loadingRef.current = false
    setLoading(false)
    setBusy(task.id)
    try {
      await Taro.openLocation({ latitude: point.latitude, longitude: point.longitude, name: task.title, address: task.bay, scale: 17 })
    } catch (error) {
      if (mounted.current) setFeedback((value) => ({ ...value, [task.id]: { error: `无法打开导航：${staffError(error)}` } }))
    } finally {
      operation.current = false
      if (mounted.current) setBusy('')
    }
  }

  const counts = staffTaskCounts(tasks)
  const visible = filterStaffTasks(tasks, filter, query)
  const completion = tasks.find((item) => item.id === completionId)
  const dutyItems = duty?.duty?.items ?? []
  const taskList = <View className='staff-task-list'>
    {lastSync && <Text className='mini-muted'>最后同步：{lastSync}</Text>}
    {loading && <Text className='staff-sync mini-muted'>正在同步任务</Text>}
    {loadError && <EmptyState title='任务同步失败' description={`${loadError}${loaded ? ' 当前保留上次数据。' : ''}`} onRetry={() => void load()} />}
    {!loading && !loadError && !visible.length && <EmptyState
      title={tasks.length ? '没有符合条件的任务' : '暂无分配给你的任务'}
      description={tasks.length ? '当前筛选没有匹配记录。' : '收到平台派单后，任务会显示在这里。'} />}
    {visible.map((task) => {
      const next = nextTaskStatus(task.status)
      const point = navigationDestination(task)
      const open = expanded === task.id
      return <View key={task.id} className={`staff-task ${task.level === '高风险' ? 'staff-task--risk' : ''}`}>
        <View className='staff-task-meta'>
          <View><Icon name='flag' tone={task.level === '高风险' ? 'danger' : 'blue'} size={28} />
            <Text className={task.level === '高风险' ? 'staff-risk' : 'mini-muted'}>{task.level}</Text>
          </View><Text className='mini-muted'>{task.source}</Text>
        </View>
        <EventCard event={task} onClick={() => setExpanded(open ? '' : task.id)} />
        <Button className='staff-detail-toggle' onClick={() => setExpanded(open ? '' : task.id)} aria-expanded={open}>
          <Text>{open ? '收起详情' : '任务详情'}</Text><Icon name={open ? 'chevronDown' : 'chevronRight'} size={28} />
        </Button>
        {open && <View className='staff-task-details'>
          <Text className='staff-paragraph'>{task.description || '暂无现场描述'}</Text>
          <Text className='mini-muted'>任务编号：{task.id}</Text>
          <Text className='mini-muted'>负责人：{task.owner || task.meta?.assignment?.staffName}</Text>
          <Text className='mini-muted'>更新时间：{task.updatedAt || task.time || '尚未记录'}</Text>
          {task.meta?.assignment?.reason && <Text className='mini-muted'>派单依据：{task.meta.assignment.reason}</Text>}
          {task.result && <View className='staff-result'><Text className='staff-label'>已记录处置结果</Text><Text>{task.result}</Text></View>}
          {!point && <Text className='mini-muted'>暂无真实现场坐标，无法开启地图导航。</Text>}
          {task.meta?.command && <Text className='mini-muted'>
            {task.meta.command.sourceMode === 'desensitized_demo' ? '教学训练仿真数据 · ' : ''}
            研判移交：{task.meta.command.handover?.status || '尚未提交'}
          </Text>}
          {task.meta?.command && ['已到达', '处理中'].includes(task.status) && <StaffCommandMaterials
            task={task} disabled={controlsLocked} onUpdated={(updated) => {
              taskRef.current = taskRef.current.map((item) => item.id === updated.id ? updated : item)
              setTasks(taskRef.current)
            }} onBusy={(value) => { operation.current = value; setBusy(value ? task.id : '') }} />}
        </View>}
        <View className='staff-actions'>
          {point && <Button className='mini-secondary' disabled={controlsLocked || undefined} onClick={() => void navigate(task)}>
            <Icon name='navigation' tone='blue' size={32} /><Text>现场导航</Text>
          </Button>}
          {next && <Button className='mini-primary' loading={busy === task.id} disabled={controlsLocked || loading || Boolean(loadError) || undefined}
            onClick={() => void advance(task.id)}>
            <Icon name={next === '已完成' ? 'send' : 'check'} tone='white' size={32} />
            <Text>{actionLabels[next as keyof typeof actionLabels]}</Text>
          </Button>}
        </View>
        {feedback[task.id]?.error && <Text className='mini-error staff-feedback'>{feedback[task.id].error}</Text>}
        {feedback[task.id]?.success && <Text className='staff-confirmation staff-feedback'>{feedback[task.id].success}</Text>}
      </View>
    })}
  </View>

  return <View className='mini-app staff-workspace'>
    <PageHeader title={tab === 'workbench' ? `${staffName}，你好` : tabs.find((item) => item.id === tab)!.label}
      eyebrow='小安智能预警系统 · 工作人员' subtitle={tab === 'workbench' ? '现场任务与日常勤务' : staffName} brand />
    <View className='mini-surface staff-surface'>
      {(tab === 'workbench' || tab === 'tasks') && <View>
        {tab === 'workbench' && <>
          <View className='staff-stats'>
            {([{ id: 'pending', label: '待接收' }, { id: 'active', label: '处理中' }, { id: 'completed', label: '已完成' }] as const).map((item) =>
              <Button className='staff-stat' key={item.id} disabled={controlsLocked || undefined} onClick={() => { setFilter(item.id); setTab('tasks') }}>
                <Text className='staff-stat-number'>{loaded ? counts[item.id] : '--'}</Text><Text>{item.label}</Text>
              </Button>)}
          </View>
          <View className='staff-tools'>
            {[
              { label: '我的任务', icon: 'tasks', action: () => { setTab('tasks'); setFilter('all') } },
              { label: '单警训练', icon: 'book', action: () => setTab('training') },
              { label: '值班安排', icon: 'clock', action: showDuty },
              { label: '个人信息', icon: 'user', action: () => setTab('mine') },
            ].map((item) => <Button className='staff-tool' key={item.label} onClick={item.action} disabled={controlsLocked || undefined}>
              <Icon name={item.icon} tone={item.icon === 'clock' ? 'amber' : 'blue'} size={44} /><Text>{item.label}</Text>
            </Button>)}
          </View>
        </>}
        <Section title='我的任务' action={loading ? '同步中' : '刷新'} onAction={() => void load()}>
          <View className='mini-tabs staff-filters'>
            {filters.map((item) => <Button className={filter === item.id ? 'active' : ''} key={item.id}
              aria-pressed={filter === item.id} disabled={controlsLocked || undefined} onClick={() => setFilter(item.id)}>{item.label}</Button>)}
          </View>
          {tab === 'tasks' && <View className='staff-search mini-field'>
            <Icon name='search' size={32} /><Input className='mini-input' value={query} maxlength={100}
              placeholder='搜索任务、编号或地点' disabled={controlsLocked || undefined} onInput={(event) => setQuery(event.detail.value)} />
          </View>}
          {taskList}
        </Section>
      </View>}
      <View style={{ display: tab === 'training' ? 'block' : 'none' }}><StaffTraining staffName={staffName} active={tab === 'training'} onBusyChange={setTrainingBusy} /></View>
      {tab === 'mine' && <Section title='工作人员信息'>
        <View className='staff-profile'><Icon name='user' tone='blue' size={54} /><View><Text className='staff-heading'>{staffName}</Text><Text className='mini-muted'>当前工作人员</Text></View></View>
        <Button className='staff-menu-row' onClick={showDuty}><Icon name='clock' tone='amber' /><Text>值班安排</Text><Icon name='chevronRight' /></Button>
        <Button className='staff-menu-row' onClick={() => { setTab('tasks'); setFilter('completed') }}><Icon name='tasks' tone='blue' /><Text>已完成任务</Text><Icon name='chevronRight' /></Button>
        <Button className='staff-menu-row' onClick={() => setTab('training')}><Icon name='book' tone='blue' /><Text>训练与档案</Text><Icon name='chevronRight' /></Button>
        <Button className='staff-menu-row' onClick={() => setExitOpen(true)}><Icon name='logout' tone='danger' /><Text>退出工作人员端</Text><Icon name='chevronRight' /></Button>
      </Section>}
    </View>
    <View className='mini-bottom-nav'>
      {tabs.map((item) => <Button key={item.id} className={`mini-nav-item ${tab === item.id ? 'active' : ''}`}
        disabled={controlsLocked || undefined} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
        <Icon name={item.icon} tone={tab === item.id ? 'blue' : 'muted'} size={42} /><Text>{item.label}</Text>
      </Button>)}
    </View>
    {completionId && <BottomSheet title='回传处置结果' onClose={() => { if (!busy) setCompletionId('') }}>
      <View className='staff-sheet'>
        <Text className='staff-heading'>{completion?.title || '任务已变化'}</Text>
        <Text className='mini-label'>本次现场处置结果</Text>
        <Textarea className='mini-textarea' value={drafts[completionId] ?? ''} maxlength={2000} disabled={Boolean(busy) || undefined}
          placeholder='填写现场情况、采取的措施与处理结果' onInput={(event) => {
            const value = event.detail.value
            setDrafts((current) => ({ ...current, [completionId]: value }))
          }} />
        {feedback[completionId]?.error && <Text className='mini-error'>{feedback[completionId].error}</Text>}
        {loadError && <Text className='mini-error'>{loadError}</Text>}
        {completion?.status !== '处理中' && <Text className='mini-muted'>当前状态：{completion?.status || '任务已不在当前派单中'}；草稿已保留。</Text>}
        <Button className='mini-primary' loading={Boolean(busy)} disabled={Boolean(busy) || loading || Boolean(loadError)
          || completion?.status !== '处理中' || !drafts[completionId]?.trim() || undefined} onClick={() => void advance(completionId, true)}>
          <Icon name='send' tone='white' size={32} /><Text>提交并完成任务</Text>
        </Button>
        <Button className='mini-secondary' disabled={Boolean(busy) || loading || undefined} onClick={() => void load()}><Icon name='refresh' tone='blue' size={32} /><Text>刷新任务状态</Text></Button>
      </View>
    </BottomSheet>}
    {dutyOpen && <BottomSheet title='值班安排' onClose={() => setDutyOpen(false)}>
      <View className='staff-sheet'>
        <Text className='mini-muted'>平台发布的值班安排 · 只读</Text>
        {dutyLoading && <Text className='mini-muted'>正在读取安排</Text>}
        {dutyError && <EmptyState title='值班安排读取失败' description={dutyError} onRetry={() => void loadDuty()} />}
        {!dutyLoading && !dutyError && !dutyItems.length && <EmptyState title='暂无已发布安排' />}
        {dutyItems.map((item) => <View className='staff-duty-row' key={item.planKey}>
          <View className='mini-row'><Icon name='clock' tone='amber' size={32} /><Text className='staff-heading'>{item.planDate} {item.timeSlot}</Text></View>
          <Text>{item.summary}</Text><Text className='mini-muted'>{item.area}</Text>
          <Text className='mini-muted'>安排人员：{item.staff?.join('、') || '未列出'}</Text>
        </View>)}
        <Button className='mini-secondary' disabled={dutyLoading || undefined} onClick={() => void loadDuty()}><Icon name='refresh' tone='blue' size={32} /><Text>刷新安排</Text></Button>
      </View>
    </BottomSheet>}
    {exitOpen && <BottomSheet title='退出工作人员端' onClose={() => setExitOpen(false)}>
      <View className='staff-sheet'>
        <Text>退出将清除本次尚未提交的处置和训练草稿，服务端记录不受影响。</Text>
        <Button className='mini-danger' onClick={() => { Taro.removeStorageSync(draftKey); onExit() }}><Icon name='logout' tone='white' size={32} /><Text>确认退出</Text></Button>
        <Button className='mini-secondary' onClick={() => setExitOpen(false)}>继续工作</Button>
      </View>
    </BottomSheet>}
  </View>
}
