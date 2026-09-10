export function simulateMaintenanceUpdateCheck(delayMs = 2000) {
  return new Promise<string>((resolve) => {
    setTimeout(() => resolve('当前已是最新版本 v3.2.1'), delayMs);
  });
}
