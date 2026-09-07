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

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
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

  useEffect(() => {
    setPreviewUrl('');
    setDownloadName('');
    setRecording(false);
    setOpening(false);
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
  }, [canRecord]);

  useEffect(() => {
    if (!recording && !previewUrl) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recording, previewUrl]);

  useEffect(() => {
    if (recording && !previewUrl && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [recording, previewUrl]);

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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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
    releaseUrl();
    urlRef.current = URL.createObjectURL(file);
    setPreviewUrl(urlRef.current);
    setDownloadName(file.name);
    setError('');
  };

  return { videoRef, previewUrl, downloadName, recording, opening, error, startRecording, stopRecording, cancelOpening, loadFile };
}
