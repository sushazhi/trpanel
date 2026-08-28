// 连接状态指示点
export function ConnectionDot({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) {
  const color =
    status === 'connected' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-500'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}
