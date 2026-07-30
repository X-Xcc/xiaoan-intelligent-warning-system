import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';

export default function VisitorHomePage() {
  return (
    <View className="container home-page">
      <Text className="hello">江滩智防</Text>
      <View className="status-card card">
        <Text>已定位到 3号湾区附近</Text>
        <Text className="risk">当前风险：中</Text>
        <Text>水位正常 · 客流较高 · 开放中</Text>
      </View>
      <Button className="help-button" onClick={() => Taro.navigateTo({ url: '/pages/visitor/emergency/index' })}>一键求助</Button>
      <View className="quick-grid">
        <View className="quick card">安全上报</View>
        <View className="quick card">处理进度</View>
        <View className="quick card">湾区状态</View>
        <View className="quick card">安全须知</View>
      </View>
    </View>
  );
}
