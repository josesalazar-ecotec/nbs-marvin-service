export function limpiarMarkdown(texto) {
  if (!texto) return '';
  return texto
    .replace(/^#+\s*/gm, '')        // quitar # headers
    .replace(/\*\*(.*?)\*\*/g, '$1') // quitar **bold**
    .replace(/\*(.*?)\*/g, '$1')     // quitar *italic*
    .replace(/---+/g, '')            // quitar separadores
    .replace(/\n{3,}/g, '\n\n')      // máx 2 saltos de línea
    .trim();
}
