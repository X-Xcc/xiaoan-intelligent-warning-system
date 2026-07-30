import { View, Text } from '@tarojs/components';
import './index.scss';

const tasks = [
  { level: '高风险', title: '儿童单独涉水', bay: '3号湾区', source: '游客求助', status: '待接收' },
  { level: '中风险', title: '救生设施损坏', bay: '5号湾区', source: '安全上报', status: '已派发' },
];

export default function StaffTasksPage() {
  return (
    <View className="container tasks-page">
      <View className="header-card card">
        <Text className="title">巡防工作台</Text>
        <Text>当前状态：在线 · 今日任务 6 · 待处置 2</Text>
      </View>
      {tasks.map((task) => (
        <View className="task-card card" key={task.title}>
          <View className="row">
            <Text className={task.level === '高风险' ? 'tag danger' : 'tag warning'}>{task.level}</Text>
            <Text className="status">{task.status}</Text>
          </View>
          <Text className="task-title">{task.title}</Text>
          <Text className="meta">{task.bay} · {task.source}</Text>
          <Text className="action">接收任务</Text>
        </View>
      ))}
    </View>
  );
}
