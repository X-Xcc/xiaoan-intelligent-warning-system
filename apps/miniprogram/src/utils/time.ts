export const nowLabel = () => {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export const makeServiceId = () => {
  const now = new Date()
  const date = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `JT-${date}-${Date.now().toString().slice(-4)}`
}
