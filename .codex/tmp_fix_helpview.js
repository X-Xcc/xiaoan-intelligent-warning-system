const fs = require('fs')

const path = 'apps/miniprogram/src/pages/main/main.tsx'
let source = fs.readFileSync(path, 'utf8')

source = source.replace(
  /\n    cancelLatestHelp,\n    supplementEvent,\n/,
  '\n',
)

source = source.replace(
  /          <HelpView\n            latestHelp=\{latestHelp\}\n            createHelp=\{sendHelp\}\n            openProgress=\{\(\) => openProgress\('help'\)\}\n            supplementEvent=\{supplementEvent\}\n            cancelHelp=\{async \(\) => \{\n              if \(await cancelLatestHelp\(\)\) openProgress\('help'\)\n            \}\}\n          \/>/,
  `          <HelpView
            latestHelp={latestHelp}
            createHelp={sendHelp}
            openProgress={() => openProgress('help')}
          />`,
)

const start = source.indexOf('function HelpView({')
const end = source.indexOf('function ProgressView({')

if (start < 0 || end < 0 || end <= start) {
  throw new Error('HelpView markers not found')
}

const helpViewBlock = `
function HelpView({
  latestHelp,
  createHelp,
  openProgress,
}: {
  latestHelp?: SafetyEvent
  createHelp: () => Promise<void>
  openProgress: () => void
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
        <Button className={\`help-orb \${latestHelp ? 'active' : ''}\`} loading={sending} disabled={sending} onClick={launchHelp}>
          <Text className='help-orb-kicker'>{latestHelp ? '求助处理中' : '一键报警'}</Text>
          <Text className='help-orb-title'>SOS</Text>
          <Text className='help-orb-sub'>{latestHelp ? '点击查看处置进度' : '同步定位给巡防组'}</Text>
        </Button>
      </View>
    </View>
  )
}
`

source = source.slice(0, start) + helpViewBlock + source.slice(end)

fs.writeFileSync(path, source)
