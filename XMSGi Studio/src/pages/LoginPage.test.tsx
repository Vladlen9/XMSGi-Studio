import type { ComponentProps } from 'react';
import { useState } from 'react';
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

function renderToggleLogin() {
  const props = renderLoginProps({});

  function LoginHarness() {
    const [showAuthForm, setShowAuthForm] = useState(false);
    return (
      <LocaleProvider>
        <LoginPage {...props} showAuthForm={showAuthForm} setShowAuthForm={setShowAuthForm} />
      </LocaleProvider>
    );
  }

  return render(<LoginHarness />);
}

describe('LoginPage', () => {
  it('opens Telegram sign-in and resets the form to the phone step', () => {
    const { props } = renderLogin();

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Telegram' }));

    expect(props.setShowAuthForm).toHaveBeenCalledOnce();
    expect(props.setAuthStep).toHaveBeenCalledWith('phone');
    expect(props.setAuthError).toHaveBeenCalledWith('');
  });

  it('adds the international prefix when phone entry starts with digits', () => {
    const { props } = renderLogin();

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '14155550123' } });

    expect(props.setPhoneNumber).toHaveBeenCalledWith('+14155550123');
  });

  it('allows removing the automatically added phone prefix', () => {
    const { props } = renderLogin({ phoneNumber: '+14155550123' });

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '14155550123' } });

    expect(props.setPhoneNumber).toHaveBeenCalledWith('14155550123');
  });

  it('does not show a generic hint before an auth message exists', () => {
    const { container } = renderLogin({ showAuthForm: true });

    expect(container.querySelector('.login-error')).not.toBeInTheDocument();
  });

  it('keeps auth errors inside the expandable form above the fields', () => {
    const { container } = renderLogin({ showAuthForm: true, authError: 'Check the phone number.' });

    const status = container.querySelector('.login-error');
    const form = container.querySelector('.login-form');
    const slot = container.querySelector('.login-error-slot');

    expect(status).toHaveTextContent('Check the phone number.');
    expect(form?.firstElementChild).toBe(slot);
    expect(slot?.firstElementChild).toBe(status);
  });

  it('closes the form when Continue is clicked a second time', () => {
    const { container } = renderToggleLogin();
    const continueButton = screen.getByRole('button', { name: 'Continue with Telegram' });
    const form = container.querySelector('.login-form');

    expect(continueButton).toHaveAttribute('aria-controls', 'telegram-login-form');
    expect(continueButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(continueButton);
    expect(form).toHaveClass('is-visible');
    expect(continueButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(continueButton);
    expect(form).not.toHaveClass('is-visible');
    expect(continueButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the form when Telegram is clicked a second time', () => {
    const { container } = renderToggleLogin();
    const telegramButton = screen.getByRole('button', { name: 'TELEGRAM' });
    const form = container.querySelector('.login-form');

    expect(telegramButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(telegramButton);
    expect(form).toHaveClass('is-visible');
    expect(telegramButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(telegramButton);
    expect(form).not.toHaveClass('is-visible');
    expect(telegramButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows code and two-factor fields for their respective auth steps', () => {
    const { rerender } = renderLogin({ showAuthForm: true, authStep: 'code' });

    expect(screen.getByLabelText('Login code')).toBeInTheDocument();
    expect(screen.queryByLabelText('Two-step password')).not.toBeInTheDocument();

    rerender(<LocaleProvider><LoginPage {...renderLoginProps({ showAuthForm: true, authStep: 'password' })} /></LocaleProvider>);

    expect(screen.getByLabelText('Login code')).toBeInTheDocument();
    expect(screen.getByLabelText('Two-step password')).toBeInTheDocument();
  });

  it('offers one-click return for a saved account after sign-out', () => {
    const { props } = renderLogin({
      signedOut: true,
      returningUserName: 'Alex Example',
    });

    expect(screen.getByText('WELCOME BACK,')).toBeInTheDocument();
    const returnButton = screen.getByRole('button', { name: 'Return to app as Alex Example' });
    expect(returnButton).toHaveTextContent('Alex Example');
    expect(screen.queryByRole('button', { name: 'Continue with Telegram' })).not.toBeInTheDocument();

    fireEvent.click(returnButton);
    expect(props.handleWelcomeBack).toHaveBeenCalledOnce();
  });

  it('opens phone sign-in from the saved-account screen', () => {
    const { container, props } = renderLogin({ signedOut: true, returningUserName: 'Alex Example' });
    const method = container.querySelector('.login-method');
    const startOver = screen.getByRole('button', { name: 'Start over with another phone' });

    expect(method?.nextElementSibling).toBe(startOver);

    fireEvent.click(startOver);

    expect(props.setShowAuthForm).toHaveBeenCalledWith(true);
    expect(props.setAuthStep).toHaveBeenCalledWith('phone');
    expect(props.setAuthError).toHaveBeenCalledWith('');
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