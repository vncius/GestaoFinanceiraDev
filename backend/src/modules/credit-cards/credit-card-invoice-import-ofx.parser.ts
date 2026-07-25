import { ParsedOfxCardTransaction } from './credit-card-invoice-import.types';

// Detecta "N/M" no fim da descrição (ex.: "MERCADO XYZ 03/12"), indicando
// uma compra parcelada cuja parcela atual é N de um total de M. Exige
// M >= 2 e N <= M para reduzir falsos positivos (datas soltas na descrição
// dificilmente têm essa forma exata no final da string).
const INSTALLMENT_PATTERN = /(\d{1,2})\s*\/\s*(\d{1,2})\s*$/;

function detectInstallment(description: string): { current: number; total: number } | null {
  const match = description.trim().match(INSTALLMENT_PATTERN);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(current) || !Number.isInteger(total)) return null;
  if (total < 2 || current < 1 || current > total) return null;
  return { current, total };
}

// Muitos bancos trazem, no extrato do mês seguinte, uma linha de crédito
// referente ao pagamento da fatura anterior — isso não é um estorno de
// compra e não deve virar lançamento de cartão.
const PREVIOUS_PAYMENT_PATTERN = /pagamento|pgto/i;

// Parser de OFX 1.x (SGML) para faturas de cartão de crédito. Reaproveita a
// mesma estratégia de backup.service.ts#parseOfxStatement (busca blocos
// <STMTTRN>...</STMTTRN> por regex, sem exigir a tag pai específica de
// cartão como <CCSTMTRS> — os extratos brasileiros de cartão também usam
// <STMTTRN> internamente), mas aqui o SINAL do valor é preservado (não
// convertido para INCOME/EXPENSE), porque é ele que diferencia compra de
// estorno/crédito.
export function parseInvoiceOfx(content: string): ParsedOfxCardTransaction[] {
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  return blocks
    .map((block): ParsedOfxCardTransaction | null => {
      const dtPosted = block.match(/<DTPOSTED>([^\s<]+)/i)?.[1] ?? '';
      const trnAmt = block.match(/<TRNAMT>([^\s<]+)/i)?.[1] ?? '';
      const fitId = block.match(/<FITID>([^\s<]+)/i)?.[1]?.trim() ?? null;
      const name = block.match(/<NAME>([^\r\n<]+)/i)?.[1]?.trim();
      const memo = block.match(/<MEMO>([^\r\n<]+)/i)?.[1]?.trim();
      const description = name || memo || '';

      if (!dtPosted || !trnAmt || !description) return null;

      const amountFloat = parseFloat(trnAmt);
      if (Number.isNaN(amountFloat)) return null;

      const date = dtPosted.length >= 8
        ? `${dtPosted.slice(0, 4)}-${dtPosted.slice(4, 6)}-${dtPosted.slice(6, 8)}`
        : '';
      if (!date) return null;

      const amountCents = Math.round(amountFloat * 100);

      // O sufixo "NN/MM" fica só como installmentInfo (estruturado, usado no
      // badge do frontend) — nunca é salvo no texto da descrição, pra não
      // duplicar a informação e confundir o usuário.
      const installmentInfo = amountCents < 0 ? detectInstallment(description) : null;
      const cleanDescription = installmentInfo
        ? description.replace(INSTALLMENT_PATTERN, '').trim()
        : description;

      return {
        date,
        description: cleanDescription,
        amountCents,
        externalRef: fitId,
        installmentInfo,
        possiblePreviousInvoicePayment: amountCents > 0 && PREVIOUS_PAYMENT_PATTERN.test(description),
      };
    })
    .filter((e): e is ParsedOfxCardTransaction => e !== null);
}
