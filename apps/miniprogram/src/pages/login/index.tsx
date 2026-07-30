import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';

export default function LoginPage() {
  const enterVisitor = () => Taro.navigateTo({ url: '/pages/visitor/home/index' });
  const enterStaff = () => Taro.navigateTo({ url: '/pages/staff-login/index' });

  return (
    <View className="login-page">
      <View className="brand-card">
        <Text className="title">江滩智防</Text>
        <Text className="subtitle">两滩七湾滨水安全服务</Text>
      </View>
      <View className="actions">
        <Button className="wechat-button" onClick={enterVisitor}>微信一键登录</Button>
        <Text className="staff-link" onClick={enterStaff}>工作人员登录</Text>
      </View>
    </View>
  );
}
