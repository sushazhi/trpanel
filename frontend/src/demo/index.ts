// 演示模式入口：--mode demo 构建或 VITE_DEMO_MODE=1 时启用浏览器内 mock 后端，
// 常规构建下该分支会被静态替换并摇树剔除，不进生产包
export const DEMO_MODE = import.meta.env.MODE === 'demo' || import.meta.env.VITE_DEMO_MODE === '1'
export { demoAdapter } from './adapter'
export { DemoSocket } from './ws'
