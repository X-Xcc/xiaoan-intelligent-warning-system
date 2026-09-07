import { Button, Checkbox, CheckboxGroup, Input, Label, Picker, Switch, Text, Textarea, View } from '@tarojs/components'
import { useDidHide, useDidShow } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BottomSheet, EmptyState, Icon, Section } from '@/components/ui'
import {
  completeTrainingTask, createTrainingAssessment, getTrainingWorkspace, reportTrainingException,
  retryTrainingTask, startTrainingTask, type TrainingArchive, type TrainingAssessment,
  type TrainingTask, type TrainingWorkspace,
} from '@/utils/training-api'
import {
  parseTrainingElapsed, resolveTrainingSubject, selectTrainingTask, staffDate, staffError,
  trainingElapsedSeconds, trainingProfiles,
} from './staff-model'

type Props = { staffName: string; active: boolean; onBusyChange: (busy: boolean) => void }
type Stage = 'prepare' | 'run' | 'assessment' | 'archive'
type Draft = { checks: string[]; manual: boolean; seconds: string; reason: string }
type Feedback = { success?: string; error?: string }
const emptyDraft: Draft = { checks: [], manual: false, seconds: '', reason: '' }
const stages: Array<{ id: Stage; label: string }> = [
  { id: 'prepare', label: '准备' }, { id: 'run', label: '训练' },
  { id: 'assessment', label: '考核' }, { id: 'archive', label: '档案' },
]
const stageFor = (status?: string): Stage => status === '训练中' ? 'run'
  : status === '待复核' || status === '待复训' ? 'assessment' : status === '已归档' ? 'archive' : 'prepare'
const reviewLabel = (status: string) => ({ pending: '待教官复核', confirmed: '已确认', revised: '已修订', rejected: '已退回补训' }[status] || status)

export function StaffTraining({ staffName, active, onBusyChange }: Props) {
  const [snapshot, setSnapshot] = useState<TrainingWorkspace | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [synced, setSynced] = useState(false)
  const [subjectChoice, setSubjectChoice] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [mode, setMode] = useState<'tasks' | 'archives'>('tasks')
  const [stage, setStage] = useState<Stage>('prepare')
  const [statusFilter, setStatusFilter] = useState('全部状态')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [now, setNow] = useState(Date.now())
  const [exceptionOpen, setExceptionOpen] = useState(false)
  const mounted = useRef(true)
  const foreground = useRef(true)
  const operation = useRef(false)
  const loadingRef = useRef(false)
  const version = useRef(0)
  const currentTask = useRef<TrainingTask | undefined>(undefined)
  const development = process.env.NODE_ENV === 'development' && process.env.TARO_APP_ENABLE_DEV_LOGIN === 'true'

  const load = useCallback(async (afterMutation = false) => {
    if ((operation.current && !afterMutation) || loadingRef.current) return
    loadingRef.current = true
    const requestVersion = ++version.current
    setLoading(true)
    try {
      const result = await getTrainingWorkspace()
      if (!mounted.current || requestVersion !== version.current) return
      setSnapshot(result)
      setSynced(true)
      setSyncError('')
    } catch (error) {
      if (mounted.current && requestVersion === version.current) {
        setSyncError(staffError(error))
        setSynced(false)
      }
    } finally {
      if (requestVersion === version.current) {
        loadingRef.current = false
        if (mounted.current) setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; version.current++; loadingRef.current = false }
  }, [])
  useEffect(() => {
    if (!active || !staffName.trim()) return
    void load()
    const interval = setInterval(() => { if (foreground.current) void load() }, 15000)
    return () => clearInterval(interval)
  }, [active, load, staffName])
  useDidShow(() => { foreground.current = true; if (active && staffName.trim()) void load() })
  useDidHide(() => { foreground.current = false })

  const tasks = snapshot?.tasks ?? []
  const profiles = trainingProfiles(tasks)
  const subject = resolveTrainingSubject(tasks, staffName, development, subjectChoice)
  const own = tasks.filter((task) => task.traineeId === subject)
  const visible = own.filter((task) => (statusFilter === '全部状态' || task.status === statusFilter)
    && `${task.subject} ${task.taskId}`.toLowerCase().includes(query.trim().toLowerCase()))
  const selected = selectTrainingTask(visible, subject, selectedId)
  currentTask.current = selected
  const assessment = snapshot?.assessments.find((item) => item.taskId === selected?.taskId)
  const archives = (snapshot?.archives ?? []).filter((item) => item.traineeId === subject)
  const archive = archives.find((item) => item.taskId === selected?.taskId)
  const draft = selected ? drafts[selected.taskId] ?? emptyDraft : emptyDraft
  const equipment = selected ? [...selected.equipment, '训练场地与个人防护已确认'] : []
  const prepared = equipment.length > 0 && equipment.every((item) => draft.checks.includes(item))
  const elapsed = selected ? trainingElapsedSeconds(selected, now) : undefined
  const duration = draft.manual ? parseTrainingElapsed(draft.seconds) : elapsed
  const validDuration = duration !== undefined && Number.isInteger(duration) && duration >= 1 && duration <= 3600
  const locked = Boolean(busy) || loading
  const canMutate = !locked && synced && Boolean(subject) && snapshot?.dataMode === snapshot?.readiness.dataMode
  const selectedFeedback = selected ? feedback[selected.taskId] : undefined
  const statuses = ['全部状态', '待训练', '训练中', '待复核', '待复训', '已归档']

  useEffect(() => {
    setStage(stageFor(selected?.status))
    setExceptionOpen(false)
  }, [selected?.taskId, selected?.status])
  useEffect(() => {
    if (!active || selected?.status !== '训练中') return
    setNow(Date.now())
    const timer = setInterval(() => { if (foreground.current) setNow(Date.now()) }, 1000)
    return () => clearInterval(timer)
  }, [active, selected?.taskId, selected?.status])

  const changeDraft = (patch: Partial<Draft>) => {
    if (!selected || operation.current) return
    const taskId = selected.taskId
    setDrafts((current) => ({ ...current, [taskId]: { ...(current[taskId] ?? emptyDraft), ...patch } }))
  }
  const notify = (id: string, message: Feedback) => {
    if (mounted.current) setFeedback((current) => ({ ...current, [id]: { ...current[id], ...message } }))
  }
  const mergeTask = (task: TrainingTask, originalId: string, expectedStatus?: string, retry = false) => {
    if (task.traineeId !== subject || (!retry && task.taskId !== originalId)
      || (expectedStatus && task.status !== expectedStatus)) throw new Error('训练回执与当前对象或状态不一致，请刷新核对。')
    if (!mounted.current) return
    setSnapshot((current) => current && ({
      ...current, tasks: current.tasks.some((item) => item.taskId === task.taskId)
        ? current.tasks.map((item) => item.taskId === task.taskId ? task : item) : [...current.tasks, task],
    }))
    setSelectedId(task.taskId)
    if (retry) { setStatusFilter('全部状态'); setQuery(''); setMode('tasks') }
  }
  const mergeAssessment = (item: TrainingAssessment) => {
    if (mounted.current) setSnapshot((current) => current && ({
      ...current, assessments: [...current.assessments.filter((value) => value.taskId !== item.taskId), item],
    }))
  }
  const perform = async (label: string, action: (task: TrainingTask) => Promise<void>) => {
    const task = currentTask.current
    if (operation.current || loadingRef.current || !synced || !task || task.traineeId !== subject
      || snapshot?.dataMode !== snapshot?.readiness.dataMode) return
    operation.current = true
    version.current++
    setBusy(label)
    onBusyChange(true)
    notify(task.taskId, { error: '', success: '' })
    try {
      await action(task)
    } catch (error) {
      notify(task.taskId, { error: `${staffError(error)} 未确认的操作请先刷新核对。` })
    } finally {
      if (mounted.current) await load(true)
      operation.current = false
      if (mounted.current) { setBusy(''); onBusyChange(false) }
    }
  }
  const start = () => {
    if (!prepared || selected?.status !== '待训练') return
    void perform('开始训练', async (task) => {
      const result = await startTrainingTask(task.taskId)
      mergeTask(result, task.taskId, '训练中')
      notify(task.taskId, { success: '平台已确认训练开始。' })
    })
  }
  const finish = () => {
    if (selected?.status !== '训练中' || !validDuration || duration === undefined) return
    void perform('提交训练', async (task) => {
      const result = await completeTrainingTask(task.taskId, duration)
      mergeTask(result, task.taskId, '待复核')
      if (!mounted.current) return
      notify(task.taskId, { success: '平台已确认训练记录提交。' })
      // Persist the confirmed completion before requesting assessment: retry only the failed stage.
      const score = await createTrainingAssessment(task.taskId)
      mergeAssessment(score)
      notify(task.taskId, { success: '考核结果已返回，复核状态以平台记录为准。' })
    })
  }
  const assess = () => {
    if (selected?.status !== '待复核') return
    void perform('请求考核', async (task) => {
      mergeAssessment(await createTrainingAssessment(task.taskId))
      notify(task.taskId, { success: '平台已返回考核记录。' })
    })
  }
  const retry = () => {
    if (!selected || !assessment || !['待复核', '待复训', '已归档'].includes(selected.status)) return
    void perform('创建复训', async (task) => {
      const result = await retryTrainingTask(task.taskId)
      mergeTask(result, task.taskId, '待训练', true)
      notify(result.taskId, { success: `复训任务已创建：${result.taskId}`, error: '' })
    })
  }
  const reportException = () => {
    if (!draft.reason.trim() || draft.reason.trim().length > 500) return
    void perform('登记异常', async (task) => {
      const result = await reportTrainingException(task.taskId, draft.reason, subject)
      mergeTask(result, task.taskId)
      if (!result.exception?.reason) throw new Error('异常记录未返回确认回执。')
      notify(task.taskId, { success: '平台已确认异常登记。' })
      if (mounted.current) setExceptionOpen(false)
    })
  }

  return <View className='staff-training'>
    <Section title='单警训练' action={loading ? '同步中' : '刷新'} onAction={() => void load()}>
      <View className='staff-source'>
        <View className='mini-row'><Icon name='info' tone='amber' size={32} /><Text>
          {snapshot ? snapshot.dataMode === 'desensitized_sample' ? '脱敏样例 · 规则评分' : `数据模式：${snapshot.dataMode}` : '尚未取得训练数据'}
        </Text></View>
        {snapshot && <>
          <Text className='mini-muted'>dataMode：{snapshot.dataMode}</Text>
          {snapshot.readiness.dataMode !== snapshot.dataMode && <Text className='mini-error'>就绪数据模式：{snapshot.readiness.dataMode}；与任务数据不一致。</Text>}
          <Text>{snapshot.readiness.notice || '服务未提供数据声明。'}</Text>
          <Text className='mini-muted'>规则版本：{snapshot.readiness.ruleVersion || '未提供'} · {staffDate(snapshot.readiness.updatedAt)}</Text>
        </>}
      </View>
      {syncError && <EmptyState title='训练同步失败' description={`${syncError}${snapshot ? ' 保留上次记录，暂不可提交。' : ''}`} onRetry={() => void load()} />}
      {loading && <Text className='staff-sync mini-muted'>正在读取训练记录</Text>}
      {snapshot && !profiles.includes(staffName) && <>
        <EmptyState title='当前工作人员尚未绑定训练编号' description={`当前身份：${staffName}。训练服务未提供姓名到训练编号的绑定关系。`} />
        {development && <View className='staff-training-subject'>
          <Text className='mini-label'>开发环境 · 训练对象选择（不改变工作人员身份）</Text>
          <Picker mode='selector' range={['请选择训练对象', ...profiles]} value={Math.max(0, profiles.indexOf(subjectChoice) + 1)}
            disabled={locked || !profiles.length || undefined} onChange={(event) => {
              setSubjectChoice(profiles[Number(event.detail.value) - 1] ?? '')
              setSelectedId(''); setStatusFilter('全部状态'); setQuery('')
            }}>
            <View className='mini-secondary staff-picker'><Icon name='user' tone='blue' size={32} /><Text>{subjectChoice || '请选择训练对象'}</Text><Icon name='chevronDown' size={28} /></View>
          </Picker>
        </View>}
      </>}
      {subject && <View className='staff-subject-line'><Icon name='user' tone='blue' size={30} /><Text>训练对象：{subject}{subject !== staffName ? '（开发环境）' : ''}</Text></View>}
      {subject && <>
        <View className='mini-tabs staff-training-modes'>
          <Button className={mode === 'tasks' ? 'active' : ''} disabled={locked || undefined} aria-pressed={mode === 'tasks'} onClick={() => setMode('tasks')}>训练任务 · {own.length}</Button>
          <Button className={mode === 'archives' ? 'active' : ''} disabled={locked || undefined} aria-pressed={mode === 'archives'} onClick={() => setMode('archives')}>个人档案 · {archives.length}</Button>
        </View>
        {mode === 'archives' ? <View>
          {!archives.length && <EmptyState title='暂无训练档案' description='档案以服务端完成教官复核后的记录为准。' />}
          {archives.map((item) => <View className='staff-archive-record' key={item.recordId}>
            <Text className='staff-heading'>{own.find((task) => task.taskId === item.taskId)?.subject || item.taskId}</Text>
            <ArchiveDetail archive={item} />
            {own.some((task) => task.taskId === item.taskId) && <Button className='mini-secondary' disabled={locked || undefined} onClick={() => {
              setSelectedId(item.taskId); setStatusFilter('全部状态'); setQuery(''); setMode('tasks'); setStage('archive')
            }}><Icon name='eye' tone='blue' size={32} /><Text>查看训练记录</Text></Button>}
          </View>)}
        </View> : <>
          <View className='staff-training-filters'>
            <View className='staff-search mini-field'><Icon name='search' size={32} /><Input className='mini-input' value={query}
              placeholder='科目或任务编号' maxlength={100} disabled={locked || undefined} onInput={(event) => setQuery(event.detail.value)} /></View>
            <Picker mode='selector' range={statuses} value={statuses.indexOf(statusFilter)} disabled={locked || undefined}
              onChange={(event) => setStatusFilter(statuses[Number(event.detail.value)] ?? '全部状态')}>
              <View className='mini-secondary staff-picker'><Text>{statusFilter}</Text><Icon name='chevronDown' size={28} /></View>
            </Picker>
          </View>
          <View className='staff-training-tasks'>
            {visible.map((task) => <Button className={`staff-training-task ${selected?.taskId === task.taskId ? 'staff-training-task--selected' : ''}`}
              key={task.taskId} disabled={locked || undefined} aria-pressed={selected?.taskId === task.taskId} onClick={() => setSelectedId(task.taskId)}>
              <View><Text className='staff-heading'>{task.subject}</Text><Text className='mini-muted'>{task.taskId}</Text></View>
              <Text className={task.status === '待复训' ? 'mini-error' : 'staff-status'}>{task.status}</Text>
              <Icon name='chevronRight' tone='blue' size={28} />
            </Button>)}
          </View>
          {!selected ? <EmptyState title={own.length ? '没有符合条件的训练' : '暂无分配的训练任务'} /> : <View className='staff-training-detail'>
            <View className='staff-detail-heading'><Text className='staff-heading'>{selected.subject}</Text><Text className='staff-status'>{selected.status}</Text></View>
            <Text className='mini-muted'>{selected.teamName} · {selected.taskId}</Text>
            <View className='mini-tabs staff-stage-tabs'>
              {stages.map((item) => {
                const enabled = item.id === 'prepare' || (item.id === 'run' && selected.status !== '待训练')
                  || (item.id === 'assessment' && ['待复核', '待复训', '已归档'].includes(selected.status))
                  || (item.id === 'archive' && Boolean(archive))
                return <Button key={item.id} disabled={!enabled || locked || undefined} className={stage === item.id ? 'active' : ''}
                  aria-pressed={stage === item.id} onClick={() => setStage(item.id)}>{item.label}</Button>
              })}
            </View>
            {selectedFeedback?.success && <Text className='staff-confirmation staff-feedback'>{selectedFeedback.success}</Text>}
            {selectedFeedback?.error && <Text className='mini-error staff-feedback'>{selectedFeedback.error}</Text>}
            {stage === 'prepare' && <View className='staff-training-stage'>
              <Text className='staff-label'>本次标准</Text><Text>{selected.standard.label}</Text>
              {selected.standard.thresholdSeconds !== undefined && <Text className='mini-muted'>标准用时：{selected.standard.thresholdSeconds} 秒</Text>}
              {selected.standard.targetMeters !== undefined && <Text className='mini-muted'>目标范围：{selected.standard.targetMeters} 米</Text>}
              <Text className='staff-label'>装备与安全确认</Text>
              <CheckboxGroup onChange={(event) => changeDraft({ checks: event.detail.value })}>
                {equipment.map((item) => <Label className='staff-check-row' key={item}>
                  <Checkbox value={item} checked={draft.checks.includes(item)} disabled={locked || selected.status !== '待训练' || undefined} color='#0d7ff9' /><Text>{item}</Text>
                </Label>)}
              </CheckboxGroup>
              <Text className='staff-label'>训练依据</Text>
              {selected.basis.map((item, index) => <Text className='mini-muted' key={`${index}-${item}`}>{item}</Text>)}
              {selected.status === '待训练' && <Button className='mini-primary' disabled={!canMutate || !prepared || undefined} loading={Boolean(busy)} onClick={start}>
                <Icon name='flag' tone='white' size={32} /><Text>开始训练</Text>
              </Button>}
            </View>}
            {stage === 'run' && <View className='staff-training-stage'>
              <Text className='staff-label'>训练用时</Text>
              <Text className='staff-timer'>{elapsed === undefined ? '--' : elapsed}<Text className='staff-timer-unit'>秒</Text></Text>
              <Text className='mini-muted'>开始时间：{staffDate(selected.startedAt)}</Text>
              {selected.status === '训练中' && <>
                <View className='staff-switch-row'><Text>录入现场计时</Text><Switch color='#0d7ff9' checked={draft.manual} disabled={locked || undefined} onChange={(event) => changeDraft({ manual: event.detail.value })} /></View>
                {draft.manual && <View className='mini-field'><Text className='mini-label'>实际用时（整数秒）</Text>
                  <Input className='mini-input' type='number' value={draft.seconds} maxlength={5} disabled={locked || undefined}
                    placeholder='1 至 3600' onInput={(event) => changeDraft({ seconds: event.detail.value })} />
                </View>}
                {!validDuration && <Text className='mini-error'>{elapsed === undefined && !draft.manual ? '服务未提供有效开始时间，请录入现场计时。' : '提交用时须为 1 至 3600 的整数秒数。'}</Text>}
                <View className='staff-actions'>
                  <Button className='mini-secondary' disabled={!canMutate || undefined} onClick={() => setExceptionOpen(true)}><Icon name='flag' tone='amber' size={32} /><Text>登记异常</Text></Button>
                  <Button className='mini-primary' disabled={!canMutate || !validDuration || undefined} loading={Boolean(busy)} onClick={finish}><Icon name='send' tone='white' size={32} /><Text>结束并提交考核</Text></Button>
                </View>
              </>}
              {selected.exception && <View className='staff-result'><Text>已登记异常：{selected.exception.reason}</Text><Text className='mini-muted'>审计编号：{selected.exception.auditId}</Text></View>}
            </View>}
            {stage === 'assessment' && <View className='staff-training-stage'>
              {!assessment ? <>
                <EmptyState title='尚无考核记录' description='训练记录与考核结果分别由平台确认。' />
                {selected.status === '待复核' && <Button className='mini-primary' disabled={!canMutate || undefined} loading={Boolean(busy)} onClick={assess}>
                  <Icon name='refresh' tone='white' size={32} /><Text>请求考核结果</Text>
                </Button>}
              </> : <>
                <Text className='staff-label'>考核总分</Text><Text className='staff-timer'>{assessment.score.total}<Text className='staff-timer-unit'>分</Text></Text>
                <Text className='staff-status'>{reviewLabel(assessment.reviewStatus)}</Text>
                {([
                  ['动作规范度', assessment.score.standardization], ['完成用时', assessment.score.completionTime],
                  ['协同一致性', assessment.score.coordination],
                ] as const).map(([label, score]) => <View className='staff-score-row' key={label}><Text>{label}</Text><Text>{score} 分</Text></View>)}
                <Text className='mini-muted'>评分输入：{assessment.inputMode}</Text>
                <Text className='mini-muted'>规则版本：{assessment.ruleVersion}</Text>
                <Text className='mini-muted'>服务端置信度：{assessment.confidence}</Text>
                <Text className='mini-muted'>记录时间：{staffDate(assessment.evidenceTime)}</Text>
                <Text className='mini-muted'>审计编号：{assessment.auditId}</Text>
                {assessment.evidence.map((item, index) => <Text className='mini-muted' key={`${index}-${item}`}>{item}</Text>)}
                {assessment.humanReviewRequired && <Text className='staff-notice'>需要教官人工复核。工作人员端不代行复核或修改评分。</Text>}
                {assessment.reviewerId && <Text>复核人：{assessment.reviewerId}</Text>}
                {assessment.reviewComment && <Text>复核意见：{assessment.reviewComment}</Text>}
                {['待复核', '待复训', '已归档'].includes(selected.status) && <Button className='mini-secondary' disabled={!canMutate || undefined} loading={Boolean(busy)} onClick={retry}>
                  <Icon name='refresh' tone='blue' size={32} /><Text>创建复训任务</Text>
                </Button>}
              </>}
            </View>}
            {stage === 'archive' && <View className='staff-training-stage'>
              {archive ? <><ArchiveDetail archive={archive} />
                {assessment && <Button className='mini-primary' disabled={!canMutate || undefined} loading={Boolean(busy)} onClick={retry}><Icon name='refresh' tone='white' size={32} /><Text>创建复训任务</Text></Button>}
              </> : <EmptyState title='尚未生成档案' description='档案以平台完成复核后的记录为准。' onRetry={() => void load()} />}
            </View>}
          </View>}
        </>}
      </>}
      {!loading && snapshot && !tasks.length && <EmptyState title='训练服务暂无任务' />}
    </Section>
    {exceptionOpen && selected && <BottomSheet title='登记训练异常' onClose={() => { if (!busy) setExceptionOpen(false) }}>
      <View className='staff-sheet'>
        <Text className='mini-label'>异常情况</Text><Textarea className='mini-textarea' maxlength={500} value={draft.reason}
          disabled={locked || undefined} placeholder='填写设备、场地或训练过程中的异常' onInput={(event) => changeDraft({ reason: event.detail.value })} />
        {selectedFeedback?.error && <Text className='mini-error'>{selectedFeedback.error}</Text>}
        <Button className='mini-primary' disabled={!canMutate || !draft.reason.trim() || undefined} loading={Boolean(busy)} onClick={reportException}><Icon name='send' tone='white' size={32} /><Text>提交异常记录</Text></Button>
      </View>
    </BottomSheet>}
  </View>
}

function ArchiveDetail({ archive }: { archive: TrainingArchive }) {
  return <View className='staff-training-stage'>
    <Text className='staff-label'>考核结论：{archive.result}</Text>
    <Text className='mini-muted'>训练对象：{archive.traineeId} · {archive.teamName}</Text>
    <Text className='mini-muted'>归档时间：{staffDate(archive.createdAt)}</Text>
    <Text className='mini-muted'>档案编号：{archive.recordId}</Text>
    <Text className='mini-muted'>审计编号：{archive.auditId}</Text>
    {!!archive.weakPoints.length && <Text className='staff-label'>待加强项</Text>}
    {archive.weakPoints.map((item, index) => <Text key={`${index}-${item}`}>{item}</Text>)}
    {archive.retrainingRecommendation && <><Text className='staff-label'>后续训练建议</Text><Text>{archive.retrainingRecommendation}</Text></>}
  </View>
}
