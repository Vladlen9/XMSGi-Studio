import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestbenchNavigation } from './TestbenchNavigation';

describe('TestbenchNavigation', () => {
  it('shares the same page links and active-page state across page testbenches', () => {
    render(
      <TestbenchNavigation
        locale="en"
        setLocale={vi.fn()}
        theme="light"
        onThemeChange={vi.fn()}
        scenarioLabel="Error scenario"
        scenario="none"
        scenarioOptions={[{ value: 'none', label: 'No error' }]}
        onScenarioChange={vi.fn()}
        onReset={vi.fn()}
        resetLabel="Reset"
        currentPage="studio"
      />,
    );

    const navigation = screen.getByRole('navigation', { name: 'Stand controls' });
    const pages = within(navigation).getByLabelText('Testbench pages');
    expect(within(pages).getByRole('link', { name: 'Login' })).toHaveAttribute('href', '../login/');
    expect(within(pages).getByRole('link', { name: 'Studio' })).toHaveAttribute('aria-current', 'page');
    expect(within(pages).getByRole('link', { name: 'Planner' })).not.toHaveAttribute('aria-current');
    expect(within(pages).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '../settings/');
    expect(within(pages).getByRole('link', { name: 'All pages' })).toHaveAttribute('href', '../');
  });

  it('exposes the shared scenario, language, theme, and reset actions', () => {
    const setLocale = vi.fn();
    const onThemeChange = vi.fn();
    const onScenarioChange = vi.fn();
    const onReset = vi.fn();

    render(
      <TestbenchNavigation
        locale="en"
        setLocale={setLocale}
        theme="light"
        onThemeChange={onThemeChange}
        scenarioLabel="Error scenario"
        scenario="none"
        scenarioOptions={[
          { value: 'none', label: 'No error' },
          { value: 'long', label: 'Long error' },
        ]}
        onScenarioChange={onScenarioChange}
        onReset={onReset}
        resetLabel="Reset"
        currentPage="planner"
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Error scenario' }), { target: { value: 'long' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dark theme' }));
    fireEvent.click(screen.getByRole('button', { name: 'RU' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(onScenarioChange).toHaveBeenCalledWith('long');
    expect(onThemeChange).toHaveBeenCalledWith('dark');
    expect(setLocale).toHaveBeenCalledWith('ru');
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('exposes an optional confirmation scenario selector', () => {
    const onConfirmationScenarioChange = vi.fn();

    render(
      <TestbenchNavigation
        locale="en"
        setLocale={vi.fn()}
        theme="light"
        onThemeChange={vi.fn()}
        scenarioLabel="Error scenario"
        scenario="none"
        scenarioOptions={[{ value: 'none', label: 'No error' }]}
        onScenarioChange={vi.fn()}
        confirmationLabel="Confirmation scenario"
        confirmationScenario="none"
        confirmationOptions={[
          { value: 'none', label: 'No confirmation' },
          { value: 'delete-draft', label: 'Delete draft' },
        ]}
        onConfirmationScenarioChange={onConfirmationScenarioChange}
        onReset={vi.fn()}
        resetLabel="Reset"
        currentPage="studio"
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Confirmation scenario' }), {
      target: { value: 'delete-draft' },
    });

    expect(onConfirmationScenarioChange).toHaveBeenCalledWith('delete-draft');
  });
});
