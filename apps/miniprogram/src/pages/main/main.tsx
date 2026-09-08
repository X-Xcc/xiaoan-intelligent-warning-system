import { useState } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { CitizenWorkspace } from '@/features/citizen/CitizenWorkspace'
import { StaffAccess } from '@/features/StaffAccess'
import { StaffWorkspace } from '@/features/staff/StaffWorkspace'
import { clearAuthSession } from '@/utils/api'
import './main.scss'

export default function MainPage() {
  const { params } = useRouter()
  const [mode, setMode] = useState<'citizen' | 'staffAccess' | 'staff'>(
    params.mode === 'staff' || params.mode === 'staffLogin' ? 'staffAccess' : 'citizen'
  )
  const [staffName, setStaffName] = useState('')
  const exitStaff = () => {
    setStaffName('')
    setMode('citizen')
  }
  const logout = () => {
    clearAuthSession()
    Taro.reLaunch({ url: '/pages/index/index' })
  }
  const openStaff = async () => {
    const result = await Taro.showModal({
      title: '切换到工作人员入口',
      content: '尚未提交的求助、上报和线索草稿将被清空，已提交的回执不受影响。',
      confirmText: '继续切换',
    })
    if (result.confirm) setMode('staffAccess')
  }

  if (mode === 'staffAccess') {
    return <StaffAccess onBack={exitStaff} onEnter={(name) => {
      setStaffName(name)
      setMode('staff')
    }} />
  }
  if (mode === 'staff' && staffName) {
    return <StaffWorkspace staffName={staffName} onExit={exitStaff} />
  }
  return <CitizenWorkspace
    initialTab={params.tab}
    initialPanel={params.panel}
    onStaff={openStaff}
    onLogout={logout}
  />
}
