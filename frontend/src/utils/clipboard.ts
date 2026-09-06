// 复制文本。非安全上下文（HTTP 访问 NAS IP、部分 WebView）里 navigator.clipboard 不存在，
// writeText 也可能因权限被拒，此时回退 execCommand；返回是否成功，由调用方决定提示。
// 回退用的 textarea 必须放在视口内并聚焦：内嵌 WebView/iframe（fnOS 桌面、iOS）里
// 视口外元素可能没有有效选区，execCommand 会静默失败（fnOS qbittorrent 面板同款方案）。
// 注意：textarea 必须挂进当前焦点元素所在的聚焦作用域。Radix 弹窗（modal focus trap）会监听
// 全局 focusin，焦点一旦落到作用域容器外就立即被拽回，导致 execCommand 空选区假成功。
// 任何意料之外的异常都归为失败并返回 false，避免调用方拿不到结果而静默无反馈
export async function copyText(text: string): Promise<boolean> {
  const r = await copyTextDetailed(text)
  return r === 'ok'
}

// 与 copyText 同逻辑，但能区分「宿主在策略层禁用了剪贴板」（如 Qoder 内嵌预览：
// clipboard-write/read 权限均为 denied，execCommand 也会假报成功但系统剪贴板无内容）。
// 这种情况页面代码无法写入，调用方应给出专门提示而不是笼统的「复制失败」
export async function copyTextDetailed(text: string): Promise<'ok' | 'fail' | 'blocked'> {
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return 'ok'
      } catch {
        // 注意：http 非安全上下文里 query(clipboard-write) 恒为 denied，但 execCommand 仍可用，
        // 所以只在这里（writeText 已失败、说明确有权限问题）才判定 blocked
        if (await isClipboardWriteDenied()) return 'blocked'
      }
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;color:transparent;font-size:1px;opacity:0.01'
    const active = document.activeElement
    const host = active && active.parentElement ? active.parentElement : document.body
    host.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, text.length)
    try {
      return document.execCommand('copy') ? 'ok' : 'fail'
    } finally {
      ta.remove()
    }
  } catch {
    return 'fail'
  }
}

async function isClipboardWriteDenied(): Promise<boolean> {
  try {
    const s = await navigator.permissions.query({ name: 'clipboard-write' as PermissionName })
    return s.state === 'denied'
  } catch {
    // 权限状态查询不可用（Safari 等）时不能据此判死，交给 execCommand 如实回报
    return false
  }
}
