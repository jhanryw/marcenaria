import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

/** Rótulo + controle + dica/erro. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  // Sem htmlFor explícito, vincula o rótulo ao campo (único filho) com um id gerado: acessibilidade e toque no rótulo.
  const autoId = React.useId();
  let control = children;
  let forId = htmlFor;
  if (!forId && label && React.isValidElement(children)) {
    const props = children.props as { id?: string };
    if (props.id) forId = props.id;
    else {
      forId = autoId;
      control = React.cloneElement(children as React.ReactElement<{ id?: string }>, { id: autoId });
    }
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && <Label htmlFor={forId}>{label}</Label>}
      {control}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
