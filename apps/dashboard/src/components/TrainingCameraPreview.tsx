import { AlertCircle, Camera, CameraOff, RefreshCw } from 'lucide-react';
import { Spin } from 'antd';
import { useEffect, useState } from 'react';
import { useTrainingMedia } from '../lib/use-training-media';

export function TrainingCameraPreview({ taskId, officer, teamName }: { taskId: string; officer: string; teamName: string }) {
  const media = useTrainingMedia(taskId);
  const [frameReady, setFrameReady] = useState(false);
  const waitingForFrame = media.opening || (media.cameraActive && !frameReady);
  const connect = (cameraId = '') => {
    setFrameReady(false);
    void media.startCamera(cameraId);
  };

  useEffect(() => {
    void media.startCamera();
    return () => media.stopCamera();
  }, [taskId]);
  useEffect(() => {
    if (!media.cameraActive) setFrameReady(false);
  }, [media.cameraActive]);

  return <section className="ot-video-tool" aria-label="真实摄像头">
    <div className="ot-camera-identity"><Camera size={16} /><strong>{officer}</strong><span>{teamName}</span></div>
    <div className="ot-video ot-camera-video" aria-busy={waitingForFrame}>
      <video ref={media.videoRef} autoPlay playsInline muted aria-label="实时摄像头画面"
        onLoadedData={() => setFrameReady(true)} onPlaying={() => setFrameReady(true)} onWaiting={() => setFrameReady(false)} onEmptied={() => setFrameReady(false)} />
      {waitingForFrame ? <div className="ot-video-placeholder ot-camera-loading" role="status">
        <Spin size="large" />
        <strong>{media.opening ? '正在连接摄像头' : '正在加载实时画面'}</strong>
        <span>{media.opening ? '等待浏览器授权或设备响应' : '等待摄像头首帧'}</span>
      </div> : !media.cameraActive && <div className="ot-video-placeholder">
        <CameraOff size={36} />
        <strong>{media.error ? '摄像头未连接' : '摄像头已关闭'}</strong><span>实时画面</span>
      </div>}
      <span className="ot-video-label"><i className={media.cameraActive && frameReady ? 'live' : ''} />{waitingForFrame ? '画面加载中' : media.cameraActive ? '实时摄像头 · 未录制' : '未采集'}</span>
    </div>
    <div className="ot-media-toolbar">
      {media.opening ? <button className="ot-button" onClick={media.stopCamera}><CameraOff size={15} />取消连接</button>
        : media.cameraActive ? <button className="ot-button" onClick={media.stopCamera}><CameraOff size={15} />关闭摄像头</button>
        : <button className="ot-button" onClick={() => connect(media.cameraId)}><RefreshCw size={15} />重新连接摄像头</button>}
      {media.cameras.length > 0 && <select className="ot-camera-select" aria-label="选择摄像头" value={media.cameraId}
        disabled={media.opening} onChange={(event) => connect(event.target.value)}>
        <option value="">默认摄像头</option>
        {media.cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `摄像头 ${index + 1}`}</option>)}
      </select>}
    </div>
    <p className="ot-media-note">实时预览 · 不录音、不录像、不上传 · 评分仍为虚拟数据</p>
    {media.error && <p className="ot-inline-error" role="alert"><AlertCircle size={15} />{media.error}</p>}
  </section>;
}
