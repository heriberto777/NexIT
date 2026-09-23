// Antes cada pantalla hardcodeaba "S/ " + valor.toFixed(2) por su cuenta (9 sitios
// distintos, símbolo de soles peruanos sin relación con el país real de operación) —
// ahora el símbolo viene de ConfiguracionSistema.monedaSimbolo.
export function formatCurrency(valor: number, simbolo: string): string {
  return `${simbolo} ${valor.toFixed(2)}`;
}
