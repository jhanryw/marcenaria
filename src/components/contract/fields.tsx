"use client";
import * as React from "react";
import { documentKind, documentStatus, formatDocument } from "@/contracts/validators";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { isValidISODate } from "@/contracts/dates";

/** CPF/CNPJ: aceita qualquer digitação, aplica máscara ao sair e AVISA (sem bloquear) se os dígitos não conferem. */
export function DocumentField({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  const st = documentStatus(value);
  const kind = documentKind(value);
  const hint =
    st === "valid" ? `${kind} válido` : st === "invalid" ? undefined : st === "incomplete" ? "Continue digitando (11 dígitos para CPF, 14 para CNPJ)." : "Opcional, mas recomendado para identificar as partes.";
  return (
    <Field label={label} htmlFor={id} hint={hint} error={st === "invalid" ? "Os dígitos não conferem. Confira o número (você ainda pode continuar)." : undefined}>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(formatDocument(e.target.value))}
        placeholder="CPF ou CNPJ"
        aria-invalid={st === "invalid" || undefined}
      />
    </Field>
  );
}

export function DateField({
  label,
  value,
  onChange,
  id,
  hint,
  error,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  id: string;
  hint?: string;
  error?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <Input id={id} type="date" value={isValidISODate(value) ? value : ""} onChange={(e) => onChange(e.target.value || null)} className="min-w-0" />
    </Field>
  );
}
