$path = 'D:\CICSIC\apps\miniprogram\src\pages\main\main.tsx'
$source = [System.IO.File]::ReadAllText($path)
$pattern = 'function HelpView\(\{[\s\S]*?\nfunction ProgressView\(\{'
$replacement = @'
function HelpView({
  latestHelp,
  createHelp,
  openProgress,
  supplementEvent: _supplementEvent,
  cancelHelp: _cancelHelp,
}: {
  latestHelp?: SafetyEvent
  createHelp: () => Promise<void>
  openProgress: () => void
  supplementEvent: (id: string, text: string) => Promise<SafetyEvent>
  cancelHelp: () => Promise<void>
}) {
  const [sending, setSending] = useState(false)

  const launchHelp = async () => {
    if (latestHelp) {
      openProgress()
      return
    }
    setSending(true)
    try {
      await createHelp()
      Taro.showToast({ title: '已发起一键报警', icon: 'none' })
    } catch (error) {
      Taro.showToast({ title: '报警失败，请重试', icon: 'none' })
    } finally {
      setSending(false)
    }
  }

  return (
    <View className='page help-page help-hero-page'>
      <View className='help-stage'>
        <View className='help-halo help-halo-one' />
        <View className='help-halo help-halo-two' />
        <Button className={`help-orb ${latestHelp ? 'active' : ''}`} loading={sending} disabled={sending} onClick={launchHelp}>
          <Text className='help-orb-kicker'>{latestHelp ? '已报警' : '一键报警'}</Text>
          <Text className='help-orb-title'>SOS</Text>
          <Text className='help-orb-sub'>{latestHelp ? '点击查看处置进度' : '同步定位给巡防组'}</Text>
        </Button>
        <Text className='help-note'>紧急情况优先报警，系统会同步给附近巡防与指挥端。</Text>
      </View>
    </View>
  )
}

function ProgressView({
'@

if (-not ($source -match $pattern)) {
  throw 'HelpView block not found'
}

$updated = [regex]::Replace($source, $pattern, $replacement, [System.Text.RegularExpressions.RegexOptions]::Singleline)
[System.IO.File]::WriteAllText($path, $updated, [System.Text.UTF8Encoding]::new($false))
