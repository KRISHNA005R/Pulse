import { useStore } from '../store/store';
import { InsuranceForm } from '../screens/Insurance';
import { InstallPrompt } from './InstallPrompt';
import { useUI, type SheetSpec } from '../store/ui';
import { Sheet } from './ui/Sheet';
import { ExpenseComposer } from './ExpenseComposer';
import { ReceiptScanner } from './ReceiptScanner';
import { TransactionDetail } from './TransactionDetail';
import { AffordView, AIChat } from './Assistant';
import { InsightDetailView, SafeBreakdown } from './money';
import { FriendInvite, FriendJoin, PersonMerge } from './Friends';
import { AuthNudge, MemberCardSheet } from './Auth';
import { AccountForm, CategoryForm, EraseForm, InvestmentForm, BudgetForm, CardForm, ContributeForm, DebtForm, GroupForm, IncomeForm, PlanForm, SettleForm, SubscriptionForm } from './Forms';
import { ShareCard } from './ShareCard';
import { CommandBar } from './CommandBar';
import { MoneyRecap } from './MoneyRecap';

function SheetFor({ spec, z }: { spec: SheetSpec; z: number }) {
  const ui = useUI();
  const { state } = useStore();
  const close = ui.closeSheet;
  switch (spec.type) {
    case 'composer':
      return (
        <Sheet title={spec.preset?.group ? `Add to ${state.groups.find((g) => g.id === spec.preset?.group)?.name}` : spec.preset?.replaceTx ? 'Split this expense' : 'Add money'} onClose={close} z={z} hideTitle={!spec.preset?.group && !spec.preset?.replaceTx}>
          <ExpenseComposer preset={spec.preset} onDone={close} />
        </Sheet>
      );
    case 'receipt':
      return (
        <Sheet title="Scan a receipt" onClose={close} z={z}>
          <ReceiptScanner onClose={close} />
        </Sheet>
      );
    case 'tx':
      return (
        <Sheet title="Transaction" onClose={close} z={z}>
          <TransactionDetail id={spec.id} onClose={close} />
        </Sheet>
      );
    case 'afford':
      return (
        <Sheet title="Can I afford this?" onClose={close} z={z}>
          <AffordView initialAmount={spec.amount} initialWhat={spec.what} />
        </Sheet>
      );
    case 'safe':
      return (
        <Sheet title="How is this calculated?" onClose={close} size="sm" z={z}>
          <SafeBreakdown />
        </Sheet>
      );
    case 'insight':
      return (
        <Sheet title="One thing to know" onClose={close} size="sm" z={z}>
          <InsightDetailView insight={spec.insight} />
        </Sheet>
      );
    case 'plan-form':
      return (
        <Sheet title={spec.planId ? 'Edit plan' : 'New plan'} onClose={close} z={z}>
          <PlanForm planId={spec.planId} template={spec.template} onDone={close} />
        </Sheet>
      );
    case 'contribute':
      return (
        <Sheet title={`Add to ${state.plans.find((p) => p.id === spec.planId)?.name ?? 'plan'}`} onClose={close} size="sm" z={z}>
          <ContributeForm planId={spec.planId} onDone={close} />
        </Sheet>
      );
    case 'budget-form':
      return (
        <Sheet title={spec.budgetId ? 'Edit budget' : 'New budget'} onClose={close} size="sm" z={z}>
          <BudgetForm budgetId={spec.budgetId} category={spec.category} onDone={close} />
        </Sheet>
      );
    case 'sub-form':
      return (
        <Sheet title={spec.subId ? 'Recurring payment' : 'Add recurring payment'} onClose={close} size="sm" z={z}>
          <SubscriptionForm subId={spec.subId} preset={spec.preset} onDone={close} />
        </Sheet>
      );
    case 'group-form':
      return (
        <Sheet title="New group" onClose={close} z={z}>
          <GroupForm onDone={close} />
        </Sheet>
      );
    case 'group-expense': {
      const g = state.groups.find((x) => x.id === spec.groupId);
      return (
        <Sheet title={g ? `Add to ${g.name}` : 'Split an expense'} onClose={close} z={z}>
          <ExpenseComposer preset={{ group: g?.id, people: g ? g.members.filter((m) => m !== 'me') : spec.personId ? [spec.personId] : [], plan: g?.plan, openPanel: g || spec.personId ? undefined : 'people' }} onDone={close} />
        </Sheet>
      );
    }
    case 'settle':
      return (
        <Sheet title="Settle up" onClose={close} size="sm" z={z}>
          <SettleForm personId={spec.personId} groupId={spec.groupId} onDone={close} />
        </Sheet>
      );
    case 'friend-invite':
      return (
        <Sheet title="Invite friends" onClose={close} size="sm" z={z}>
          <FriendInvite onDone={close} />
        </Sheet>
      );
    case 'friend-join':
      return (
        <Sheet title={spec.code?.startsWith('group=') ? 'Join a group' : 'Connect on PULSE'} onClose={close} size="sm" z={z}>
          <FriendJoin code={spec.code} onDone={close} />
        </Sheet>
      );
    case 'auth-nudge':
      return (
        <Sheet title={`Save your PULSE, ${state.user.name}`} onClose={close} size="sm" z={z}>
          <AuthNudge onDone={close} />
        </Sheet>
      );
    case 'member-card':
      return (
        <Sheet title="Your member card" onClose={close} size="sm" z={z}>
          <MemberCardSheet onDone={close} />
        </Sheet>
      );
    case 'person-merge':
      return (
        <Sheet title="Same person twice?" onClose={close} size="sm" z={z}>
          <PersonMerge personId={spec.personId} onDone={close} />
        </Sheet>
      );
    case 'income-form':
      return (
        <Sheet title={spec.incomeId ? 'Edit income' : 'Add income source'} onClose={close} size="sm" z={z}>
          <IncomeForm incomeId={spec.incomeId} onDone={close} />
        </Sheet>
      );
    case 'account-form':
      return (
        <Sheet title={spec.accountId ? 'Edit account' : 'Add account'} onClose={close} size="sm" z={z}>
          <AccountForm accountId={spec.accountId} onDone={close} />
        </Sheet>
      );
    case 'category-form':
      return (
        <Sheet title={spec.categoryId ? 'Edit category' : 'New category'} onClose={close} z={z}>
          <CategoryForm categoryId={spec.categoryId} kind={spec.kind} name={spec.name} onSaved={spec.onSaved} onDone={close} />
        </Sheet>
      );
    case 'erase':
      return (
        <Sheet title="Erase all data?" onClose={close} size="sm" z={z}>
          <EraseForm onDone={close} />
        </Sheet>
      );
    case 'install':
      return (
        <Sheet title="Keep PULSE on your home screen" onClose={close} size="sm" z={z}>
          <InstallPrompt onDone={close} />
        </Sheet>
      );
    case 'insurance-form':
      return (
        <Sheet title={spec.insuranceId ? 'Edit policy' : 'Add insurance'} onClose={close} z={z}>
          <InsuranceForm insuranceId={spec.insuranceId} onDone={close} />
        </Sheet>
      );
    case 'investment-form':
      return (
        <Sheet title={spec.investmentId ? 'Edit investment' : 'Add a SIP or investment'} onClose={close} z={z}>
          <InvestmentForm investmentId={spec.investmentId} onDone={close} />
        </Sheet>
      );
    case 'card-form':
      return (
        <Sheet title={spec.cardId ? 'Edit card' : 'Add credit card'} onClose={close} z={z}>
          <CardForm cardId={spec.cardId} onDone={close} />
        </Sheet>
      );
    case 'debt-form':
      return (
        <Sheet title={spec.debtId ? 'Edit loan' : 'Add a loan'} onClose={close} size="sm" z={z}>
          <DebtForm debtId={spec.debtId} onDone={close} />
        </Sheet>
      );
    case 'share-card':
      return (
        <Sheet title="Budget out loud" onClose={close} z={z}>
          <ShareCard preset={spec.preset} />
        </Sheet>
      );
    case 'command':
      return (
        <Sheet title="Search" hideTitle onClose={close} z={z}>
          <div className="pt-8 md:pt-6">
            <CommandBar initial={spec.query} onClose={close} />
          </div>
        </Sheet>
      );
    case 'recap':
      return (
        <Sheet title="Monthly recap" onClose={close} size="full" tone="bg" z={z}>
          <MoneyRecap onClose={close} month={spec.month} />
        </Sheet>
      );
    case 'ai':
      return (
        <Sheet title="PULSE AI" onClose={close} size="full" tone="bg" z={z}>
          <AIChat />
        </Sheet>
      );
    case 'confirm':
      return (
        <Sheet title={spec.title} onClose={close} size="sm" z={z}>
          <p className="text-[15px] text-ink2">{spec.body}</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" className="btn-quiet" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="btn bg-neg text-white"
              onClick={() => {
                spec.run();
                close();
              }}
            >
              {spec.confirm}
            </button>
          </div>
        </Sheet>
      );
  }
}

export function SheetHost() {
  const ui = useUI();
  return (
    <>
      {ui.sheets.map((s, i) => (
        <SheetFor key={`${i}-${s.type}`} spec={s} z={i} />
      ))}
    </>
  );
}
