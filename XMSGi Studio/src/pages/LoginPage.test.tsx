import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/lib/i18n';
import { LoginPage } from './LoginPage';

function renderLogin(overrides: Partial<ComponentProps<typeof LoginPage>> = {}) {
  const props: ComponentProps<typeof LoginPage> = {
    connecting: false,
    notification: { visible: false, message: '', type: 'info', title: '' },
    closeNotification: vi.fn(),
    signedOut: false,
    returningUserName: '',
    returningUserUsername: '',
    authStep: 'phone',
    showAuthForm: false,
    phoneNumber: '',
    phoneCode: '',
    twoFactorPassword: '',
    authBusy: false,
    authError: '',
    setShowAuthForm: vi.fn(),
    setAuthStep: vi.fn(),
    setPhoneNumber: vi.fn(),
    setPhoneCode: vi.fn(),
    setTwoFactorPassword: vi.fn(),
    setAuthError: vi.fn(),
    handleTelegramAuth: vi.fn().mockResolvedValue(undefined),
    handleWelcomeBack: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return {
    ...render(<LocaleProvider><LoginPage {...props} /></LocaleProvider>),
    props,
  };
}

describe('LoginPage', () => {
  it('opens Telegram sign-in and resets the form to the phone step', () => {
    const { props } = renderLogin();

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Telegram' }));

    expect(props.setShowAuthForm).toHaveBeenCalledOnce();
    expect(props.setAuthStep).toHaveBeenCalledWith('phone');
    expect(props.setAuthError).toHaveBeenCalledWith('');
  });

  it('shows code and two-factor fields for their respective auth steps', () => {
    const { rerender } = renderLogin({ showAuthForm: true, authStep: 'code' });

    expect(screen.getByLabelText('Login code')).toBeInTheDocument();
    expect(screen.queryByLabelText('Two-step password')).not.toBeInTheDocument();

    rerender(<LocaleProvider><LoginPage {...renderLoginProps({ showAuthForm: true, authStep: 'password' })} /></LocaleProvider>);

    expect(screen.getByLabelText('Login code')).toBeInTheDocument();
    expect(screen.getByLabelText('Two-step password')).toBeInTheDocument();
  });

  it('offers one-click Welcome Back for a signed-out account', () => {
    const { props } = renderLogin({
      signedOut: true,
      returningUserName: 'Alex Example',
    });
    const accountButton = screen.getByRole('button', { name: /return to app.*Alex Example/i });

    expect(screen.getByText('WELCOME BACK,')).toBeInTheDocument();
    expect(accountButton).toHaveTextContent('Alex Example');
    expect(accountButton.querySelector('.returning-user-arrow')).toBeInTheDocument();
    fireEvent.click(accountButton);
    expect(props.handleWelcomeBack).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Continue with Telegram' })).not.toBeInTheDocument();
  });
});

function renderLoginProps(overrides: Partial<ComponentProps<typeof LoginPage>>): ComponentProps<typeof LoginPage> {
  return {
    connecting: false,
    notification: { visible: false, message: '', type: 'info', title: '' },
    closeNotification: vi.fn(),
    signedOut: false,
    returningUserName: '',
    returningUserUsername: '',
    authStep: 'phone' as const,
    showAuthForm: false,
    phoneNumber: '',
    phoneCode: '',
    twoFactorPassword: '',
    authBusy: false,
    authError: '',
    setShowAuthForm: vi.fn(),
    setAuthStep: vi.fn(),
    setPhoneNumber: vi.fn(),
    setPhoneCode: vi.fn(),
    setTwoFactorPassword: vi.fn(),
    setAuthError: vi.fn(),
    handleTelegramAuth: vi.fn().mockResolvedValue(undefined),
    handleWelcomeBack: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}