"use client";
import * as React from "react";
import { Button } from "./button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "./dialog";

interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn>(async () => false);
export const useConfirm = () => React.useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = React.useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );

  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={state !== null} onOpenChange={(o) => !o && close(false)}>
        {state && (
          <DialogContent title={state.title} hideClose>
            {state.message && <DialogBody className="text-sm text-muted-foreground">{state.message}</DialogBody>}
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button variant={state.destructive ? "destructive" : "default"} onClick={() => close(true)}>
                {state.confirmLabel ?? "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
