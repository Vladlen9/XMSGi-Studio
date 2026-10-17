import { ArrowRight, ArrowUpRight } from 'lucide-react';
import xmsgiLogoMaster from '@/assets/xmsgi-logo-master.png';
import { Notification } from '@/components/Notification';
import type { NotificationState } from '@/types';
import { useLocale } from '@/lib/i18n';

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
        <section className={`auth-panel ${showAuthForm ? 'is-auth-open' : ''} ${signedOut ? 'is-returning' : ''}`}>
          <div className="auth-language-switch" role="group" aria-label={t('language.title')}>
            <button type="button" className={locale === 'en' ? 'is-selected' : ''} onClick={() => setLocale('en')} aria-pressed={locale === 'en'}>
              EN
            </button>
            <span aria-hidden="true">|</span>
            <button type="button" className={locale === 'ru' ? 'is-selected' : ''} onClick={() => setLocale('ru')} aria-pressed={locale === 'ru'}>
              RU
            </button>
          </div>
          <div className="auth-intro">
            <div className="auth-hero-copy" aria-label={t('hero.signInIntro')}>
              <span className="auth-hero-line auth-hero-line-main" role="img" aria-label="XMSGi">
                <img className="auth-hero-logo-x" src={xmsgiLogoMaster} alt="" aria-hidden="true" />
                <span aria-hidden="true">{t('auth.loginHeroMain')}</span>
              </span>
              <span className="auth-hero-line auth-hero-line-sub">{t('auth.loginHeroSub')}</span>
              <span className="auth-hero-tagline">{t('auth.loginHeroTagline')}</span>
              <span className="auth-hero-tagline-sub">{t('auth.loginHeroTaglineSub')}</span>
            </div>

            <div className="auth-access">
              {!signedOut && (
                <button
                  type="button"
                  className="auth-cta"
                  aria-label={t('auth.continueTelegram')}
                  onClick={() => {
                    setShowAuthForm((current) => !current);
                    setAuthStep('phone');
                    setAuthError('');
                  }}
                >
                  <span>{t('auth.continue')}</span>
                  <ArrowRight size={17} aria-hidden="true" />
                  <span>{t('auth.telegram')}</span>
                </button>
              )}

              <div className={`auth-form ${showAuthForm ? 'is-visible' : ''}`}>
                {authStep === 'phone' && (
                  <div className="field">
                    <label htmlFor="login-phone">{t('auth.phone')}</label>
                    <input
                      id="login-phone"
                      type="tel"
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      placeholder={t('auth.phonePlaceholder')}
                      autoComplete="tel"
                    />
                  </div>
                )}

                {authStep !== 'phone' && (
                  <div className="field">
                    <label htmlFor="login-code">{t('auth.loginCode')}</label>
                    <input
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
                  <div className="field">
                    <label htmlFor="login-password">{t('auth.twoFactorPassword')}</label>
                    <input
                      id="login-password"
                      type="password"
                      value={twoFactorPassword}
                      onChange={(event) => setTwoFactorPassword(event.target.value)}
                      placeholder={t('auth.twoFactorPasswordPlaceholder')}
                      autoComplete="current-password"
                    />
                  </div>
                )}

                {authError && <p className="auth-error" role="alert">{authError}</p>}

                <button
                  className="action-button"
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
                    className="auth-back-button"
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

              {signedOut && (
                <aside className="returning-user-panel" aria-label={t('auth.returningUser')}>
                  <div className="returning-user-copy">
                    <span className="returning-user-greeting">{t('auth.welcomeBack')}</span>
                    <button
                      type="button"
                      className="returning-user-name"
                      onClick={handleWelcomeBack}
                      disabled={authBusy}
                      aria-label={t('auth.returnToApp', { name: returningUserName || returningUserUsername || t('auth.returningUser') })}
                      title={t('auth.returnToApp', { name: returningUserName || returningUserUsername || t('auth.returningUser') })}
                    >
                      <span>{returningUserName || (returningUserUsername ? `@${returningUserUsername}` : t('auth.returningUser'))}</span>
                      <ArrowUpRight className="returning-user-arrow" size={16} aria-hidden="true" />
                    </button>
                  </div>
                </aside>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}