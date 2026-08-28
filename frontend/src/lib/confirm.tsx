import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ConfirmOptions {
  title: string
  content?: string
  danger?: boolean
  okText?: string
  cancelText?: string
}

type State = (ConfirmOptions & { resolve: (ok: boolean) => void }) | null

let setStateFn: ((s: State) => void) | null = null

/** 命令式确认对话框（替代 antd modal.confirm） */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    setStateFn?.({ ...opts, resolve })
  })
}

/** 在应用根节点渲染一次即可 */
export function ConfirmHost() {
  const { t } = useTranslation()
  const [state, setState] = useState<State>(null)
  setStateFn = setState

  const close = (ok: boolean) => {
    state?.resolve(ok)
    setState(null)
  }

  return (
    <Dialog open={!!state} onOpenChange={(open) => { if (!open) close(false) }}>
      <DialogContent className="glass-panel-strong sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{state?.title}</DialogTitle>
          {state?.content && <DialogDescription>{state.content}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {state?.cancelText ?? t('common.cancel')}
          </Button>
          <Button variant={state?.danger ? 'destructive' : 'default'} onClick={() => close(true)}>
            {state?.okText ?? t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type { ConfirmOptions }
export default confirm
