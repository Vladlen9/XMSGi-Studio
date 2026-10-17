import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Notification } from '@/components/Notification';
import type { NotificationState } from '@/types';
import { useLocale } from '@/lib/i18n';
import './LoginPage.css';

type AuthStep = 'phone' | 'code' | 'password';

type LoginPageProps = {
  connecting: boolean;
  notification: NotificationState;
  closeNotification: () => void;
  signedOut: boolean;
  returningUserName: string;
  returningUserUsername: string;
  authStep: AuthStep;
  showAuthForm: boolean;
  phoneNumber: string;
  phoneCode: string;
  twoFactorPassword: string;
  authBusy: boolean;
  authError: string;
  setShowAuthForm: React.Dispatch<React.SetStateAction<boolean>>;
  setAuthStep: React.Dispatch<React.SetStateAction<AuthStep>>;
  setPhoneNumber: React.Dispatch<React.SetStateAction<string>>;
  setPhoneCode: React.Dispatch<React.SetStateAction<string>>;
  setTwoFactorPassword: React.Dispatch<React.SetStateAction<string>>;
  setAuthError: React.Dispatch<React.SetStateAction<string>>;
  handleTelegramAuth: () => Promise<void>;
  handleWelcomeBack: () => Promise<void>;
};

export function LoginPage({
  connecting,
  notification,
  closeNotification,
  signedOut,
  returningUserName,
  returningUserUsername,
  authStep,
  showAuthForm,
  phoneNumber,
  phoneCode,
  twoFactorPassword,
  authBusy,
  authError,
  setShowAuthForm,
  setAuthStep,
  setPhoneNumber,
  setPhoneCode,
  setTwoFactorPassword,
  setAuthError,
  handleTelegramAuth,
  handleWelcomeBack,
}: LoginPageProps) {
  const { locale, setLocale, t } = useLocale();
  const returningUserLabel = returningUserName || (returningUserUsername ? `@${returningUserUsername}` : t('auth.returningUser'));
  const returningUserActionLabel = t('auth.returnToApp', { name: returningUserLabel });
  const loginFormRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const form = loginFormRef.current;
    if (!form) return;

    if (showAuthForm) {
      form.style.setProperty('--login-form-open-height', `${form.scrollHeight}px`);
    } else {
      form.style.removeProperty('--login-form-open-height');
    }
  }, [authError, authStep, locale, showAuthForm]);

  return (
    <>
      <div className={`connection-spinner ${connecting ? 'show' : ''}`}>
        <div className="connection-spinner-ring" />
      </div>

      <Notification
        message={notification.message}
        type={notification.type}
        title={notification.title}
        visible={notification.visible}
        onClose={closeNotification}
      />

      <div className="app">
        <section className={`auth-panel auth-screen ${showAuthForm ? 'is-auth-open' : ''}`} lang={locale}>
          <div className="auth-language-switch" role="group" aria-label={t('language.title')}>
            <button type="button" className={locale === 'en' ? 'is-selected' : ''} onClick={() => setLocale('en')} aria-pressed={locale === 'en'}>
              EN
            </button>
            <span aria-hidden="true">|</span>
            <button type="button" className={locale === 'ru' ? 'is-selected' : ''} onClick={() => setLocale('ru')} aria-pressed={locale === 'ru'}>
              RU
            </button>
          </div>
          <main className="login-layout">
            <section className="login-brand" aria-label="MSGi Studio">
              <h1 className="login-wordmark">
                <span className="login-wordmark-top">
                  <span className="login-mark" aria-hidden="true" />
                  <span>{t('auth.loginHeroMain')}</span>
                </span>
                <span className="login-wordmark-bottom">{t('auth.loginHeroSub')}</span>
              </h1>
              <p className="login-tagline">
                <span>{t('auth.loginHeroTagline')}</span>
                <span>{t('auth.loginHeroTaglineSub')}</span>
              </p>
            </section>

            <button
              className="login-divider"
              type="button"
              aria-label={showAuthForm ? t('auth.startOver') : t('auth.signIn')}
              aria-expanded={showAuthForm}
              aria-controls="telegram-login-form"
              title={showAuthForm ? t('auth.startOver') : t('auth.signIn')}
              onClick={() => {
                setShowAuthForm((current) => !current);
                setAuthStep('phone');
                setAuthError('');
              }}
            />

            <section className="login-panel" aria-label={t('hero.signInIntro')}>
              <div className={`login-method ${signedOut ? 'is-returning' : ''}`}>
                {signedOut ? (
                  <div className="login-returning-user">
                    <span className="login-returning-greeting">{t('auth.welcomeBack')}</span>
                    <button
                      type="button"
                      className="login-returning-account"
                      onClick={handleWelcomeBack}
                      disabled={authBusy}
                      aria-label={returningUserActionLabel}
                      title={returningUserActionLabel}
                    >
                      <span>{returningUserLabel}</span>
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="login-method-action"
                      aria-label={t('auth.continueTelegram')}
                      aria-expanded={showAuthForm}
                      aria-controls="telegram-login-form"
                      onClick={() => {
                        setShowAuthForm((current) => !current);
                        setAuthStep('phone');
                        setAuthError('');
                      }}
                    >
                      {t('auth.continue')}
                    </button>
                    <ArrowRight className="login-arrow" size={25} aria-hidden="true" />
                    <button
                      type="button"
                      className="login-method-action"
                      aria-expanded={showAuthForm}
                      aria-controls="telegram-login-form"
                      onClick={() => {
                        setShowAuthForm((current) => !current);
                        setAuthError('');
                      }}
                    >
                      {t('auth.telegram')}
                    </button>
                  </>
                )}
              </div>

              {signedOut && (
                <button
                  type="button"
                  className="login-returning-start-over"
                  aria-expanded={showAuthForm}
                  aria-controls="telegram-login-form"
                  onClick={() => {
                    setShowAuthForm(true);
                    setAuthStep('phone');
                    setAuthError('');
                  }}
                  disabled={authBusy}
                >
                  {t('auth.startOver')}
                </button>
              )}

              <div id="telegram-login-form" ref={loginFormRef} className={`login-form ${showAuthForm ? 'is-visible' : ''}`} aria-hidden={!showAuthForm}>
                <div className="login-error-slot" aria-live="polite">
                  {authError && <p className="login-error" role="alert">{authError}</p>}
                </div>

                {authStep === 'phone' && (
                  <div className="login-field">
                    <label className="login-field-label" htmlFor="login-phone">{t('auth.phone')}</label>
                    <input
                      className="login-field-input"
                      id="login-phone"
                      type="tel"
                      value={phoneNumber}
                      onChange={(event) => {
                        const nextPhoneNumber = event.target.value;
                        const addInternationalPrefix = phoneNumber.length === 0 && /^\d/.test(nextPhoneNumber);
                        setPhoneNumber(addInternationalPrefix ? `+${nextPhoneNumber}` : nextPhoneNumber);
                      }}
                      placeholder={t('auth.phonePlaceholder')}
                      autoComplete="tel"
                    />
                  </div>
                )}

                {authStep !== 'phone' && (
                  <div className="login-field">
                    <label className="login-field-label" htmlFor="login-code">{t('auth.loginCode')}</label>
                    <input
                      className="login-field-input"
                      id="login-code"
                      type="text"
                      value={phoneCode}
                      onChange={(event) => setPhoneCode(event.target.value)}
                      placeholder={t('auth.loginCodePlaceholder')}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </div>
                )}

                {authStep === 'password' && (
                  <div className="login-field">
                    <label className="login-field-label" htmlFor="login-password">{t('auth.twoFactorPassword')}</label>
                    <input
                      className="login-field-input"
                      id="login-password"
                      type="password"
                      value={twoFactorPassword}
                      onChange={(event) => setTwoFactorPassword(event.target.value)}
                      placeholder={t('auth.twoFactorPasswordPlaceholder')}
                      autoComplete="current-password"
                    />
                  </div>
                )}

                <button
                  className="login-submit"
                  onClick={handleTelegramAuth}
                  disabled={authBusy || (authStep === 'phone' ? !phoneNumber.trim() : !phoneCode.trim())}
                >
                  {authBusy
                    ? t('auth.connecting')
                    : authStep === 'phone'
                      ? t('auth.signIn')
                      : authStep === 'password'
                        ? t('auth.verifyConnect')
                        : t('auth.verifyCode')}
                </button>

                {authStep !== 'phone' && (
                  <button
                    className="login-back-button"
                    onClick={() => {
                      setAuthStep('phone');
                      setPhoneCode('');
                      setTwoFactorPassword('');
                      setAuthError('');
                    }}
                    disabled={authBusy}
                  >
                    {t('auth.startOver')}
                  </button>
                )}
            </div>
            </section>
          </main>
        </section>
      </div>
    </>
  );
}