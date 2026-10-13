import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Category, CategoryType } from '../../types';
import { CategoriesService } from '../../services/categories.service';
import { sortByName } from '../../utils/sort';
import { Button } from './Button';

const NEW = '__new_category__';

// Select de categoria com "+ Nova categoria…" (U15 do plano de UX): cria a
// categoria do tipo certo sem sair do formulário e já a seleciona. A gestão
// completa (renomear, desativar) continua em Configurações → Categorias.
export function CategorySelect({
  value,
  onChange,
  type,
  categories,
  className,
  placeholder,
}: {
  value: string;
  onChange: (id: string) => void;
  type: CategoryType;
  categories: Category[];
  className: string;
  placeholder: string;
}) {
  const { t } = useTranslation('common');
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const options = sortByName(categories.filter((c) => c.type === type && c.active !== false));

  const createMut = useMutation({
    mutationFn: () => CategoriesService.create({ name: name.trim(), type }),
    onSuccess: (created) => {
      // O pai pode estar com a lista antiga por um instante; o id já vale.
      qc.setQueryData<Category[]>(['categories'], (prev) => (prev ? [...prev, created] : prev));
      qc.invalidateQueries({ queryKey: ['categories'] });
      onChange(created.id);
      setCreating(false);
    },
  });

  function submit() {
    if (name.trim()) createMut.mutate();
  }

  if (creating) {
    return (
      <div className="flex gap-2">
        <input
          className={className}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('categorySelect.newPlaceholder')}
          aria-label={t('categorySelect.newPlaceholder')}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
          }}
        />
        <Button size="sm" onClick={submit} loading={createMut.isPending} disabled={!name.trim()}>
          {t('categorySelect.create')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setCreating(false)}>
          {t('categorySelect.cancel')}
        </Button>
      </div>
    );
  }

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => {
        if (e.target.value === NEW) { setName(''); setCreating(true); return; }
        onChange(e.target.value);
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      <option value={NEW}>{t('categorySelect.newOption')}</option>
    </select>
  );
}
