import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getAuthToken, setAuthToken, UNAUTHORIZED_EVENT } from '@/api/authToken'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

// 服务端启用 API_TOKEN 时的令牌输入：任何 401 都会唤起它。
// 本服务没有登录接口（认证默认交给宿主网关），静态令牌由运维写在服务端，
// 浏览器只能由用户输入一次留在本地，否则整站请求与 WebSocket 都会 401。
export function AuthTokenDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  useEffect(() => {
    const onUnauthorized = () => setOpen(true)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const submit = () => {
    const token = value.trim()
    if (!token) return
    setAuthToken(token)
    setOpen(false)
    // 整页重载：首屏请求都在无令牌状态下发过，逐个重试不如重来一次干净
    window.location.reload()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('auth.title')}</DialogTitle>
          <DialogDescription>{t('auth.desc')}</DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          autoFocus
          autoComplete="off"
          value={value}
          placeholder={t('auth.placeholder')}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        {getAuthToken() && (
          <p className="text-footnote text-muted-foreground">{t('auth.overwrite')}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!value.trim()} onClick={submit}>
            {t('auth.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
