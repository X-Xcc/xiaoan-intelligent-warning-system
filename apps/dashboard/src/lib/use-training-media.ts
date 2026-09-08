import { useEffect, useRef, useState } from 'react';

export function useTrainingMedia(taskId?: string, canRecord = true) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const urlRef = useRef('');
  const generation = useRef(0);
  const openingRef = useRef(false);
  const allowedRef = useRef(canRecord);
  allowedRef.current = canRecord;
  const [previewUrl, setPreviewUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');
  const [recording, setRecording] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState('');

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };
  const releaseUrl = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = '';
  };
  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    releaseStream();
    setRecording(false);
  };
  const cancelOpening = () => {
    if (!openingRef.current) return;
    generation.current += 1;
    openingRef.current = false;
    setOpening(false);
  };
  const stopCamera = () => {
    cancelOpening();
    stopRecording();
  };
  const startCamera = async (deviceId = '') => {
    if (openingRef.current || recording || !allowedRef.current) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前环境无法访问摄像头，请使用 HTTPS 或本机 localhost / 127.0.0.1 地址。');
      return;
    }
    const current = ++generation.current;
    releaseStream();
    openingRef.current = true;
    setOpening(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false,
      });
      if (current !== generation.current || !allowedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      releaseUrl();
      setPreviewUrl('');
      const track = stream.getTracks().find((item) => item.kind === 'video');
      setCameraId(track?.getSettings?.().deviceId ?? deviceId);
      for (const item of stream.getTracks()) item.onended = () => {
        if (current !== generation.current || streamRef.current !== stream) return;
        stopCamera();
        setError('摄像头连接已中断，请检查设备后重新连接。');
      };
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (current === generation.current) setCameras(devices.filter((device) => device.kind === 'videoinput'));
      } catch { /* Preview remains available when device enumeration is restricted. */ }
    } catch (cause) {
      if (current !== generation.current) return;
      releaseStream();
      const name = cause instanceof DOMException ? cause.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? '摄像头未授权，请在浏览器地址栏允许摄像头访问，然后重新连接。'
        : name === 'NotFoundError' ? '未检测到摄像头，请连接设备后重试。'
        : name === 'OverconstrainedError' ? '所选摄像头不可用，请选择其他设备。'
        : '摄像头不可用，请检查设备连接或是否被其他应用占用。');
    } finally {
      if (current === generation.current) {
        openingRef.current = false;
        setOpening(false);
      }
    }
  };

  useEffect(() => {
    setPreviewUrl('');
    setDownloadName('');
    setRecording(false);
    setOpening(false);
    setCameraActive(false);
    setCameraId('');
    setCameras([]);
    openingRef.current = false;
    setError('');
    return () => {
      generation.current += 1;
      openingRef.current = false;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      releaseStream();
      releaseUrl();
    };
  }, [taskId]);

  useEffect(() => {
    if (canRecord) return;
    cancelOpening();
    if (recorderRef.current?.state === 'recording') stopRecording();
    else releaseStream();
  }, [canRecord]);

  useEffect(() => {
    if (!recording && !previewUrl) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recording, previewUrl]);

  useEffect(() => {
    if ((recording || cameraActive) && !previewUrl && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [recording, cameraActive, previewUrl]);

  const startRecording = async () => {
    if (openingRef.current || recording || !allowedRef.current) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持录像，可改用本地视频或仅计时训练。');
      return;
    }
    const current = generation.current;
    openingRef.current = true;
    setOpening(true);
    try {
      const stream = streamRef.current ?? await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (current !== generation.current || !allowedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      releaseUrl();
      setPreviewUrl('');
      if (videoRef.current) videoRef.current.srcObject = stream;
      const chunks: Blob[] = [];
      let size = 0;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunks.push(event.data);
        size += event.data.size;
        if (size > 200 * 1024 * 1024 && recorder.state === 'recording') {
          recorder.stop();
          setError('本地录像已达 200 MB，已停止录制并保留回放。');
        }
      };
      recorder.onstop = () => {
        if (current !== generation.current || recorder !== recorderRef.current) return;
        if (chunks.length) {
          releaseUrl();
          urlRef.current = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
          setPreviewUrl(urlRef.current);
          setDownloadName(`${taskId ?? 'training'}.${recorder.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`);
        }
        releaseStream();
        setRecording(false);
      };
      recorder.onerror = () => {
        if (current !== generation.current) return;
        setError('录像中断，请检查摄像头。训练计时仍然保留。');
        stopRecording();
      };
      recorder.start(1000);
      setRecording(true);
    } catch (cause) {
      if (current !== generation.current) return;
      releaseStream();
      setError(cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? '摄像头未授权，可改用本地视频或仅计时训练。'
        : '摄像头不可用，请检查设备占用或改用本地视频。');
    } finally {
      if (current === generation.current) {
        openingRef.current = false;
        setOpening(false);
      }
    }
  };

  const loadFile = (file?: File) => {
    if (!file || recording || openingRef.current) return;
    if (!file.type.startsWith('video/')) { setError('请选择视频文件。'); return; }
    if (file.size > 200 * 1024 * 1024) { setError('视频不能超过 200 MB。'); return; }
    releaseStream();
    releaseUrl();
    urlRef.current = URL.createObjectURL(file);
    setPreviewUrl(urlRef.current);
    setDownloadName(file.name);
    setError('');
  };

  return {
    videoRef, previewUrl, downloadName, recording, opening, error, startRecording, stopRecording, cancelOpening, loadFile,
    cameraActive, cameras, cameraId, startCamera, stopCamera,
  };
}
