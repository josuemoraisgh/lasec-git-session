import { StudentIdentity } from '../types';

const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStudentName(value: string): string | undefined {
  if (value.trim().length === 0) {
    return 'Informe o nome que deve aparecer nos commits.';
  }

  return undefined;
}

export function validateStudentEmail(value: string): string | undefined {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return 'Informe o e-mail que deve aparecer nos commits.';
  }

  if (!SIMPLE_EMAIL_REGEX.test(trimmed)) {
    return 'Informe um e-mail em formato valido, por exemplo aluno@universidade.br.';
  }

  return undefined;
}

export function normalizeStudentIdentity(name: string, email: string): StudentIdentity {
  return {
    name: name.trim(),
    email: email.trim()
  };
}
