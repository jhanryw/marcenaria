"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { formatMoneyPlain, parseDecimal, parseMoneyToCents } from "@/lib/money";
import { inputClass } from "./input";

type Common = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode"> & {
  prefix?: string;
  suffix?: string;
  invalid?: boolean;
};

function toText(v: number | null, maxDecimals = 4): string {
  if (v === null || !Number.isFinite(v)) return "";
  return String(Number(v.toFixed(maxDecimals))).replace(".", ",");
}

/**
 * Campo numérico com teclado decimal. Aceita "1.234,5", "12.5" etc.
 * `onChange` recebe null quando o campo está vazio e NÃO é chamado enquanto o
 * texto for inválido (o valor anterior é mantido).
 */
export function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  invalid,
  className,
  maxDecimals = 4,
  ...rest
}: Common & { value: number | null; onChange: (v: number | null) => void; maxDecimals?: number }) {
  const [text, setText] = React.useState(toText(value, maxDecimals));
  const [bad, setBad] = React.useState(false);
  const focused = React.useRef(false);

  React.useEffect(() => {
    if (!focused.current) {
      setText(toText(value, maxDecimals));
      setBad(false);
    }
  }, [value, maxDecimals]);

  return (
    <div className="relative flex w-full items-center">
      {prefix && <span className="pointer-events-none absolute left-4 text-base text-muted-foreground">{prefix}</span>}
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || bad || undefined}
        value={text}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          focused.current = false;
          setText(toText(value, maxDecimals));
          setBad(false);
          rest.onBlur?.(e);
        }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (t.trim() === "") {
            setBad(false);
            onChange(null);
            return;
          }
          const n = parseDecimal(t);
          if (n === null) {
            setBad(true);
            return;
          }
          setBad(false);
          onChange(n);
        }}
        className={cn(inputClass, prefix && "pl-11", suffix && "pr-12", "tabular", className)}
      />
      {suffix && <span className="pointer-events-none absolute right-4 text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

/** Campo em reais; trabalha em centavos inteiros. */
export function MoneyInput({
  cents,
  onChange,
  invalid,
  className,
  ...rest
}: Common & { cents: number | null; onChange: (cents: number | null) => void }) {
  const fmt = (c: number | null) => (c === null ? "" : formatMoneyPlain(c));
  const [text, setText] = React.useState(fmt(cents));
  const [bad, setBad] = React.useState(false);
  const focused = React.useRef(false);

  React.useEffect(() => {
    if (!focused.current) {
      setText(fmt(cents));
      setBad(false);
    }
  }, [cents]);

  return (
    <div className="relative flex w-full items-center">
      <span className="pointer-events-none absolute left-4 text-base text-muted-foreground">R$</span>
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || bad || undefined}
        value={text}
        onFocus={(e) => {
          focused.current = true;
          // seleciona tudo ao focar (o texto não é reescrito aqui: "1.500,00" já é lido corretamente)
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          focused.current = false;
          setText(fmt(cents));
          setBad(false);
          rest.onBlur?.(e);
        }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (t.trim() === "") {
            setBad(false);
            onChange(null);
            return;
          }
          const c = parseMoneyToCents(t);
          if (c === null || c < 0) {
            setBad(true);
            return;
          }
          setBad(false);
          onChange(c);
        }}
        className={cn(inputClass, "pl-11 tabular", className)}
      />
    </div>
  );
}
