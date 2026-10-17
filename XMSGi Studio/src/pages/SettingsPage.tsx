import { SettingsView } from '@/components/SettingsView';
import type { TelegramStatusSnapshot } from '@/hooks/useTelegramAuth';

type SettingsPageProps = {
  onClose: () => void;
  accountName: string;
  telegramUsername: string;
  telegramConnected: boolean;
  telegramConnecting: boolean;
  telegramAuthStep: 'phone' | 'code' | 'password';
  telegramPhoneNumber: string;
  telegramPhoneCode: string;
  telegramTwoFactorPassword: string;
  telegramAuthBusy: boolean;
  telegramAuthError: string;
  telegramStatus: TelegramStatusSnapshot;
  telegramCredentials: { hasCredentials: boolean; hasSession: boolean; connected: boolean; signedOut: boolean };
  telegramApiId: string;
  telegramApiHash: string;
  telegramCredentialsBusy: boolean;
  telegramCredentialsError: string;
  onTelegramApiIdChange: (value: string) => void;
  onTelegramApiHashChange: (value: string) => void;
  onSaveTelegramCredentials: () => void;
  onTelegramPhoneNumberChange: (value: string) => void;
  onTelegramPhoneCodeChange: (value: string) => void;
  onTelegramTwoFactorPasswordChange: (value: string) => void;
  onTelegramAuth: () => void;
  onTelegramReconnect: () => void;
  onTelegramDisconnect: () => void;
};

export function SettingsPage({
  onClose,
  accountName,
  telegramUsername,
  telegramConnected,
  telegramConnecting,
  telegramAuthStep,
  telegramPhoneNumber,
  telegramPhoneCode,
  telegramTwoFactorPassword,
  telegramAuthBusy,
  telegramAuthError,
  telegramStatus,
  telegramCredentials,
  telegramApiId,
  telegramApiHash,
  telegramCredentialsBusy,
  telegramCredentialsError,
  onTelegramApiIdChange,
  onTelegramApiHashChange,
  onSaveTelegramCredentials,
  onTelegramPhoneNumberChange,
  onTelegramPhoneCodeChange,
  onTelegramTwoFactorPasswordChange,
  onTelegramAuth,
  onTelegramReconnect,
  onTelegramDisconnect,
}: SettingsPageProps) {
  return (
    <SettingsView
      onClose={onClose}
      accountName={accountName}
      telegramUsername={telegramUsername}
      telegramConnected={telegramConnected}
      telegramConnecting={telegramConnecting}
      telegramAuthStep={telegramAuthStep}
      telegramPhoneNumber={telegramPhoneNumber}
      telegramPhoneCode={telegramPhoneCode}
      telegramTwoFactorPassword={telegramTwoFactorPassword}
      telegramAuthBusy={telegramAuthBusy}
      telegramAuthError={telegramAuthError}
      telegramStatus={telegramStatus}
      telegramCredentials={telegramCredentials}
      telegramApiId={telegramApiId}
      telegramApiHash={telegramApiHash}
      telegramCredentialsBusy={telegramCredentialsBusy}
      telegramCredentialsError={telegramCredentialsError}
      onTelegramApiIdChange={onTelegramApiIdChange}
      onTelegramApiHashChange={onTelegramApiHashChange}
      onSaveTelegramCredentials={onSaveTelegramCredentials}
      onTelegramPhoneNumberChange={onTelegramPhoneNumberChange}
      onTelegramPhoneCodeChange={onTelegramPhoneCodeChange}
      onTelegramTwoFactorPasswordChange={onTelegramTwoFactorPasswordChange}
      onTelegramAuth={onTelegramAuth}
      onTelegramReconnect={onTelegramReconnect}
      onTelegramDisconnect={onTelegramDisconnect}
    />
  );
}
