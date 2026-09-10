import { useCallback, useRef } from "react";

/**
 * 图片加载重试 hook，替代 DOM 元素上的 _retryLeft hack。
 * @param maxRetries 最大重试次数，默认 3
 * @param delay 重试间隔(ms)，默认 500
 * @param onHide 超过重试次数后的回调（可选），如隐藏元素
 * @returns onError 处理函数，绑定到 <img onError>
 */
export function useImageRetry(
  maxRetries = 3,
  delay = 500,
  onHide?: (img: HTMLImageElement) => void,
) {
  const countRef = useRef(new WeakMap<HTMLImageElement, number>());

  const onError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const el = e.currentTarget;
      const left = countRef.current.get(el) ?? maxRetries;
      if (left > 0) {
        countRef.current.set(el, left - 1);
        setTimeout(() => {
          // 触发重新加载：加时间戳防缓存
          const src = el.src.split("?")[0];
          el.src = `${src}?_t=${Date.now()}`;
        }, delay);
      } else {
        onHide?.(el);
      }
    },
    [maxRetries, delay, onHide],
  );

  return { onError };
}
