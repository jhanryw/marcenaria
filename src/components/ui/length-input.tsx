"use client";
import * as React from "react";
import { cmToMm, mmToCm } from "@/lib/units";
import { NumberInput } from "./number-input";

type NumberInputProps = React.ComponentProps<typeof NumberInput>;

/**
 * Campo de medida em CENTÍMETROS que guarda MILÍMETROS.
 *  - `mm` é o valor armazenado (o que o motor de cálculo usa); o campo mostra mm ÷ 10;
 *  - ao digitar, "60", "60,5" e "60.5" viram 600, 605 e 605 mm;
 *  - o texto digitado não é reescrito enquanto o campo tem foco (a conversão não atrapalha a edição);
 *    ao sair do campo ele é reformatado a partir do valor armazenado.
 */
export function CmInput({
  mm,
  onChangeMm,
  ...rest
}: Omit<NumberInputProps, "value" | "onChange" | "suffix" | "maxDecimals"> & {
  mm: number | null;
  onChangeMm: (mm: number | null) => void;
}) {
  return (
    <NumberInput
      {...rest}
      suffix="cm"
      maxDecimals={3}
      value={mm === null ? null : mmToCm(mm)}
      onChange={(cm) => onChangeMm(cm === null ? null : cmToMm(cm))}
    />
  );
}
