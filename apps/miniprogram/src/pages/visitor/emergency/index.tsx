import { View, Text } from '@tarojs/components';
import './index.scss';

export default function EmergencyPage() {
  return (
    <View className="emergency-page">
      <View className="location">
        <Text className="title">紧急求助</Text>
        <Text>已定位到 3号湾区附近</Text>
      </View>
      <View className="hold-button">
        <Text>按住求助</Text>
        <Text className="hint">长按2秒发送当前位置</Text>
      </View>
      <Text className="footer-tip">非紧急情况？前往安全上报</Text>
    </View>
  );
}
