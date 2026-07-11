import { FormEvent, KeyboardEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SendHorizontal } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

const MAX_LENGTH = 2000;

interface ChatInputProps {
  disabled: boolean;
  onSend: (message: string) => void;
}

export default function ChatInput({ disabled, onSend }: ChatInputProps) {
  const { t } = useTranslation('onboarding');
  const [value, setValue] = useState('');

  const trimmed = value.trim();
  const nearLimit = value.length >= MAX_LENGTH - 200;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={handleKeyDown}
          maxLength={MAX_LENGTH}
          rows={2}
          aria-label={t('chat.inputLabel')}
          placeholder={t('chat.inputPlaceholder')}
          className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button
          type="submit"
          disabled={disabled || !trimmed}
          loading={disabled}
          icon={<SendHorizontal size={14} />}
          aria-label={t('chat.sendLabel')}
        >
          {t('chat.send')}
        </Button>
      </div>
      {nearLimit && (
        <p className="mt-1 text-right text-xs text-gray-400" data-testid="char-counter">
          {value.length}/{MAX_LENGTH}
        </p>
      )}
    </form>
  );
}
