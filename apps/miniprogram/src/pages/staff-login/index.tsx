import { View, Text, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';

export default function StaffLoginPage() {
  return (
    <View className="staff-login container">
      <Text className="page-title">工作人员登录</Text>
      <View className="form card">
        <Input placeholder="请输入工号" />
        <Input password placeholder="请输入密码" />
        <Button className="primary-button" onClick={() => Taro.navigateTo({ url: '/pages/staff/tasks/index' })}>登录</Button>
      </View>
    </View>
  );
}
