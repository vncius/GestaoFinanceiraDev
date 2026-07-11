import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import OnboardingChat from './OnboardingChat';
import {
  OnboardingMessage,
  OnboardingService,
} from '../../../services/onboarding.service';

vi.mock('../../../services/onboarding.service', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../services/onboarding.service')>();
  return {
    ...original,
    OnboardingService: {
      getStatus: vi.fn(),
      skip: vi.fn(),
      completeManual: vi.fn(),
      getConversation: vi.fn(),
      sendMessage: vi.fn(),
    },
  };
});

const getConversation = vi.mocked(OnboardingService.getConversation);
const sendMessage = vi.mocked(OnboardingService.sendMessage);

function message(overrides: Partial<OnboardingMessage> = {}): OnboardingMessage {
  return {
    id: `msg-${Math.random()}`,
    role: 'USER',
    content: 'olá',
    turn: 1,
    status: 'OK',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderChat(status: 'IN_PROGRESS' | 'AWAITING_CONFIRMATION' = 'IN_PROGRESS') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingChat status={status} onManual={() => {}} manualLoading={false} />
    </QueryClientProvider>,
  );
}

async function typeAndSend(text: string) {
  const input = await screen.findByRole('textbox');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /enviar mensagem/i }));
}

describe('OnboardingChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('estado vazio mostra a dica inicial', async () => {
    getConversation.mockResolvedValue([]);
    renderChat();
    expect(await screen.findByText(/conte um pouco sobre suas finanças/i)).toBeInTheDocument();
  });

  it('retomada: renderiza o histórico persistido', async () => {
    getConversation.mockResolvedValue([
      message({ content: 'Tenho conta no Nubank' }),
      message({ role: 'ASSISTANT', content: 'Anotei! Qual é sua renda mensal?' }),
    ]);
    renderChat();
    expect(await screen.findByText('Tenho conta no Nubank')).toBeInTheDocument();
    expect(screen.getByText('Anotei! Qual é sua renda mensal?')).toBeInTheDocument();
  });

  it('envio: mostra bolha otimista + indicador e depois a resposta', async () => {
    getConversation.mockResolvedValueOnce([]);
    let resolveSend!: (value: Awaited<ReturnType<typeof OnboardingService.sendMessage>>) => void;
    sendMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );

    renderChat();
    await typeAndSend('Recebo 10 mil por mês');

    expect(await screen.findByText('Recebo 10 mil por mês')).toBeInTheDocument();
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();

    getConversation.mockResolvedValue([
      message({ content: 'Recebo 10 mil por mês' }),
      message({ role: 'ASSISTANT', content: 'Ótimo, registrei sua renda!' }),
    ]);
    resolveSend({
      assistantMessage: message({ role: 'ASSISTANT', content: 'Ótimo, registrei sua renda!' }),
      status: 'IN_PROGRESS',
      summaryPresented: false,
      draft: {},
    });

    expect(await screen.findByText('Ótimo, registrei sua renda!')).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Recebo 10 mil por mês' }),
    );
  });

  it('erro do provedor: mantém a mensagem com aviso e permite reenviar', async () => {
    getConversation.mockResolvedValue([]);
    sendMessage.mockRejectedValueOnce(new Error('O assistente está indisponível no momento.'));

    renderChat();
    await typeAndSend('Olá!');

    expect(await screen.findByRole('alert')).toHaveTextContent(/indisponível/i);
    expect(screen.getByText('Olá!')).toBeInTheDocument();

    sendMessage.mockResolvedValueOnce({
      assistantMessage: message({ role: 'ASSISTANT', content: 'Agora sim! Vamos lá.' }),
      status: 'IN_PROGRESS',
      summaryPresented: false,
      draft: {},
    });
    fireEvent.click(screen.getByRole('button', { name: /reenviar/i }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Olá!' }));
  });

  it('resumo pronto aparece quando o status é AWAITING_CONFIRMATION', async () => {
    getConversation.mockResolvedValue([message({ role: 'ASSISTANT', content: 'Resumo pronto!' })]);
    renderChat('AWAITING_CONFIRMATION');
    expect(await screen.findByTestId('summary-ready')).toBeInTheDocument();
  });

  it('input limita mensagens a 2000 caracteres e mostra contador', async () => {
    getConversation.mockResolvedValue([]);
    renderChat();

    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'a'.repeat(2500) } });

    expect((input as HTMLTextAreaElement).value).toHaveLength(2000);
    expect(screen.getByTestId('char-counter')).toHaveTextContent('2000/2000');
  });

  it('conteúdo do assistente é renderizado como texto puro (sem HTML)', async () => {
    getConversation.mockResolvedValue([
      message({ role: 'ASSISTANT', content: '<img src=x onerror=alert(1)>' }),
    ]);
    renderChat();

    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
