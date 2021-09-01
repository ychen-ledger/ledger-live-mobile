// @flow

import { useTheme } from "@react-navigation/native";
import React, { useMemo, useCallback, useState, useEffect } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";

import type {
  CryptoCurrency,
  TokenCurrency,
  Transaction,
  TransactionStatus,
} from "@ledgerhq/live-common/lib/types";
import type {
  Account,
  AccountLike,
} from "@ledgerhq/live-common/lib/types/account";

import type {
  Exchange,
  ExchangeRate,
} from "@ledgerhq/live-common/lib/exchange/swap/types";
import {
  CurrenciesStatus,
  getSupportedCurrencies,
  getEnabledTradeMethods,
} from "@ledgerhq/live-common/lib/exchange/swap/logic";

// import { getAccountCurrency } from "@ledgerhq/live-common/lib/account";
import useBridgeTransaction from "@ledgerhq/live-common/lib/bridge/useBridgeTransaction";
import { useDebounce } from "@ledgerhq/live-common/lib/hooks/useDebounce";

import { Trans } from "react-i18next";
import { getAccountBridge } from "@ledgerhq/live-common/lib/bridge";
import {
  accountWithMandatoryTokens,
  flattenAccounts,
  getAccountCurrency,
  getAccountName,
  getAccountUnit,
} from "@ledgerhq/live-common/lib/account";
import { BigNumber } from "bignumber.js";
import { useSelector } from "react-redux";
import { useCurrenciesByMarketcap } from "@ledgerhq/live-common/lib/currencies";
import { AccessDeniedError } from "@ledgerhq/live-common/lib/errors";
import { getExchangeRates } from "@ledgerhq/live-common/lib/exchange/swap";
import Config from "react-native-config";
import AccountAmountRow from "./FormSelection/AccountAmountRow";
import Button from "../../components/Button";
import LText from "../../components/LText";
import CurrencyUnitValue from "../../components/CurrencyUnitValue";
import Switch from "../../components/Switch";
import { accountsSelector } from "../../reducers/accounts";
import { swapKYCSelector } from "../../reducers/settings";
import GenericInputLink from "./FormSelection/GenericInputLink";
import Changelly from "../../icons/swap/Changelly";
import Wyre from "../../icons/swap/Wyre";
import Lock from "../../icons/Lock";
import Unlock from "../../icons/Unlock";
import CurrencyIcon from "../../components/CurrencyIcon";
import { NavigatorName, ScreenName } from "../../const";

const providerIcons = {
  changelly: Changelly,
  wyre: Wyre,
};

export type SwapRouteParams = {
  exchange: Exchange,
  exchangeRate: ExchangeRate,
  currenciesStatus: CurrenciesStatus,
  selectableCurrencies: (CryptoCurrency | TokenCurrency)[],
  transaction?: Transaction,
  status?: TransactionStatus,
  selectedCurrency: CryptoCurrency | TokenCurrency,
  providers: any,
  provider: any,
  installedApps: any,
  target: "from" | "to",
  rateExpiration?: Date,
};

type Props = {
  route: { params: SwapRouteParams },
  navigation: *,
  defaultAccount: ?AccountLike,
  defaultParentAccount: ?Account,
  providers: any,
  provider: any,
};

export default function SwapForm({
  route,
  navigation,
  defaultAccount: initDefaultAccount,
  providers,
  provider,
}: Props) {
  const { colors } = useTheme();

  const accounts = useSelector(accountsSelector);

  const swapKYC = useSelector(swapKYCSelector);
  const providerKYC = swapKYC[provider];

  const [error, setError] = useState(null);
  const [rate, setRate] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [rateExpiration, setRateExpiration] = useState(null);
  const [fetchingRate, setFetchingRate] = useState(false);

  const [tradeMethod, setTradeMethod] = useState<"fixed" | "float">(
    getEnabledTradeMethods[0] || "float",
  );

  const enhancedAccounts = useMemo(
    () => accounts.map(acc => accountWithMandatoryTokens(acc, [])),
    [accounts],
  );

  const allAccounts = flattenAccounts(enhancedAccounts);

  const elligibleAccountsForSelectedCurrency = allAccounts.filter(account =>
    account.balance.gt(0),
  );

  const defaultAccount =
    initDefaultAccount || elligibleAccountsForSelectedCurrency[0];

  const defaultParentAccount =
    defaultAccount.type === "TokenAccount"
      ? accounts.find(a => a.id === defaultAccount.parentId)
      : null;

  const selectableCurrencies = getSupportedCurrencies({ providers, provider });

  const maybeFilteredCurrencies = defaultAccount?.balance.gt(0)
    ? selectableCurrencies.filter(c => c !== getAccountCurrency(defaultAccount))
    : selectableCurrencies;

  const sortedCryptoCurrencies = useCurrenciesByMarketcap(
    maybeFilteredCurrencies,
  );

  const exchange: Exchange = useMemo(() => {
    const exch = route.params?.exchange
      ? {
          ...route.params.exchange,
          toCurrency: route.params.exchange.fromAccount
            ? sortedCryptoCurrencies.find(
                c =>
                  c !== getAccountCurrency(route.params.exchange.fromAccount),
              )
            : route.params.exchange.toCurrency,
        }
      : {
          fromAccount: defaultAccount?.balance.gt(0)
            ? defaultAccount
            : undefined,
          fromParentAccount: defaultAccount?.balance.gt(0)
            ? defaultParentAccount
            : undefined,
          toCurrency: sortedCryptoCurrencies[0],
          toAccount: undefined,
        };

    if (exch.toCurrency) {
      const currentToCurrency = exch.toAccount
        ? getAccountCurrency(exch.toAccount)
        : null;
      if (currentToCurrency !== exch.toCurrency)
        exch.toAccount = allAccounts.find(
          a => exch.toCurrency === getAccountCurrency(a),
        );
    }

    return exch;
  }, [
    allAccounts,
    defaultAccount,
    defaultParentAccount,
    route.params?.exchange,
    sortedCryptoCurrencies,
  ]);

  const [maxSpendable, setMaxSpendable] = useState();

  const { fromAccount, fromParentAccount, toAccount, toCurrency } = exchange;
  // const fromCurrency = fromAccount ? getAccountCurrency(fromAccount) : null;
  // const toCurrency = toAccount ? getAccountCurrency(toAccount) : null;

  const {
    status,
    transaction,
    setTransaction,
    bridgePending,
  } = useBridgeTransaction(() => ({
    account: fromAccount,
    parentAccount: fromParentAccount,
  }));

  const debouncedTransaction = useDebounce(transaction, 500);

  const toggleUseAllAmount = useCallback(() => {
    const bridge = getAccountBridge(fromAccount, fromParentAccount);

    setTransaction(
      bridge.updateTransaction(
        transaction || bridge.createTransaction(fromAccount),
        {
          amount: maxSpendable || BigNumber(0),
          useAllAmount: !transaction?.useAllAmount,
        },
      ),
    );
  }, [
    fromAccount,
    fromParentAccount,
    setTransaction,
    transaction,
    maxSpendable,
  ]);

  useEffect(() => {
    if (!fromAccount) return;

    let cancelled = false;
    getAccountBridge(fromAccount, fromParentAccount)
      .estimateMaxSpendable({
        account: fromAccount,
        parentAccount: fromParentAccount,
        transaction: debouncedTransaction,
      })
      .then(estimate => {
        if (cancelled) return;

        setMaxSpendable(estimate);
      });

    // eslint-disable-next-line consistent-return
    return () => {
      cancelled = true;
    };
  }, [fromAccount, fromParentAccount, debouncedTransaction]);

  const fromUnit = useMemo(() => fromAccount && getAccountUnit(fromAccount), [
    fromAccount,
  ]);

  const onEditToAccount = useCallback(() => {
    navigation.navigate(ScreenName.SwapV2FormSelectAccount, {
      exchange,
      selectedCurrency: exchange.toCurrency,
      target: "to",
    });
  }, [exchange, navigation]);

  const onAddAccount = useCallback(() => {
    navigation.navigate(NavigatorName.AddAccounts, {
      screen: ScreenName.AddAccountsSelectDevice,
      params: {
        currency: exchange.toCurrency,
        returnToSwap: true,
        onSuccess: () =>
          navigation.navigate(ScreenName.SwapForm, {
            exchange,
          }),
      },
    });
  }, [exchange, navigation]);

  useEffect(() => {
    const KYCUserId = Config.SWAP_OVERRIDE_KYC_USER_ID || providerKYC?.id;
    async function getRates() {
      setFetchingRate(true);
      try {
        // $FlowFixMe No idea how to pass this
        const rates = await getExchangeRates(
          {
            ...exchange,
            toAccount:
              exchange.toAccount || exchange.toCurrency
                ? {
                    type: "Account",
                    currency: exchange.toCurrency,
                    unit: exchange.toCurrency.units[0],
                  }
                : {},
          },
          transaction,
          KYCUserId,
        );

        const rate = rates.find(
          rate =>
            rate.tradeMethod === tradeMethod && rate.provider === provider,
        );

        if (rate?.error) {
          if (rate?.error && rate.error instanceof AccessDeniedError) {
            // setShowUnauthorizedRates(true);
          }
          setError(rate.error);
        } else {
          setRate(rate); // FIXME when we have multiple providers this will not be enough
          setRateExpiration(new Date(Date.now() + 60000));
        }
      } catch (error) {
        setError(error);
      } finally {
        setFetchingRate(false);
      }
    }
    if (!error && transaction?.amount.gt(0) && !rate) {
      getRates();
    } else if (transaction?.amount.lte(0)) {
      setRate(null);
    }
  }, [
    exchange,
    fromAccount,
    toAccount,
    error,
    transaction,
    tradeMethod,
    providerKYC?.id,
    provider,
    rate,
  ]);

  useEffect(() => {
    setRate(null);
  }, [debouncedTransaction]);

  const ProviderIcon = providerIcons[provider];

  const { magnitudeAwareRate, payoutNetworkFees } = rate || {};

  const toAccountName = toAccount ? getAccountName(toAccount) : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View>
        <AccountAmountRow
          navigation={navigation}
          exchange={exchange}
          transaction={transaction}
          onUpdateTransaction={setTransaction}
          status={status}
          bridgePending={bridgePending}
          provider={provider}
          providers={providers}
          useAllAmount={transaction?.useAllAmount}
          fetchingRate={fetchingRate}
          rate={rate}
        />
        {rate ? (
          <>
            <GenericInputLink
              label={<Trans i18nKey="transfer.swap.form.summary.provider" />}
              tooltip={<Trans i18nKey="transfer.swap.form.summary.provider" />}
              onEdit={() => {}}
            >
              {ProviderIcon ? <ProviderIcon size={12} /> : null}
              <LText semiBold style={styles.valueLabel}>
                {provider}
              </LText>
            </GenericInputLink>
            {fromUnit && toCurrency && magnitudeAwareRate ? (
              <GenericInputLink
                label={<Trans i18nKey="transfer.swap.form.summary.method" />}
                tooltip={<Trans i18nKey="transfer.swap.form.summary.method" />}
                onEdit={() => {}}
              >
                {tradeMethod === "fixed" ? (
                  <Lock size={12} color={colors.darkBlue} />
                ) : (
                  <Unlock size={12} color={colors.darkBlue} />
                )}
                <LText semiBold style={styles.valueLabel}>
                  <CurrencyUnitValue
                    value={BigNumber(10).pow(fromUnit.magnitude)}
                    unit={fromUnit}
                    showCode
                  />
                  {" = "}
                  <CurrencyUnitValue
                    unit={toCurrency.units[0]}
                    value={BigNumber(10)
                      .pow(fromUnit.magnitude)
                      .times(magnitudeAwareRate)}
                    showCode
                  />
                </LText>
              </GenericInputLink>
            ) : null}

            <GenericInputLink
              label={<Trans i18nKey="send.summary.fees" />}
              tooltip={<Trans i18nKey="send.summary.fees" />}
              onEdit={() => {}}
            >
              {payoutNetworkFees && toCurrency ? (
                <LText semiBold style={styles.valueLabel}>
                  <CurrencyUnitValue
                    unit={toCurrency.units[0]}
                    value={payoutNetworkFees}
                    showCode
                  />
                </LText>
              ) : null}
            </GenericInputLink>
            {toCurrency ? (
              toAccountName ? (
                <GenericInputLink
                  label={<Trans i18nKey="transfer.swap.form.target" />}
                  onEdit={onEditToAccount}
                >
                  <CurrencyIcon currency={toCurrency} size={16} />
                  <LText semiBold style={styles.valueLabel}>
                    {toAccountName}
                  </LText>
                </GenericInputLink>
              ) : (
                <View
                  style={[
                    styles.addAccountsection,
                    { backgroundColor: colors.lightLive },
                  ]}
                >
                  <LText
                    color="live"
                    semiBold
                    style={styles.addAccountLabel}
                    numberOfLines={2}
                  >
                    <Trans
                      i18nKey="transfer.swap.form.noAccount"
                      values={{ currency: toCurrency.name }}
                    />
                  </LText>
                  <View style={styles.spacer} />
                  <Button
                    type="primary"
                    onPress={onAddAccount}
                    title={
                      <Trans i18nKey="transfer.swap.emptyState.CTAButton" />
                    }
                    containerStyle={styles.addAccountButton}
                    titleStyle={styles.addAccountButtonLabel}
                  />
                </View>
              )
            ) : null}
          </>
        ) : null}
      </View>

      <View>
        <View style={styles.available}>
          <View style={styles.availableLeft}>
            <LText>
              <Trans i18nKey="transfer.swap.form.amount.available" />
            </LText>
            <LText semiBold>
              {maxSpendable ? (
                <CurrencyUnitValue
                  showCode
                  unit={fromUnit}
                  value={maxSpendable}
                />
              ) : (
                "-"
              )}
            </LText>
          </View>
          {maxSpendable ? (
            <View style={styles.availableRight}>
              <LText style={styles.maxLabel}>
                <Trans i18nKey="transfer.swap.form.amount.useMax" />
              </LText>
              <Switch
                style={styles.switch}
                value={transaction?.useAllAmount}
                onValueChange={toggleUseAllAmount}
              />
            </View>
          ) : null}
        </View>
        <View style={styles.buttonContainer}>
          <Button
            containerStyle={styles.button}
            event="ExchangeStartBuyFlow"
            type="primary"
            disabled={!!bridgePending}
            title={<Trans i18nKey="transfer.swap.form.tab" />}
            onPress={() => {
              /** move to swap summary */
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 16,
    justifyContent: "space-between",
  },
  button: {
    flex: 1,
  },
  buttonContainer: {
    paddingTop: 24,
    flexDirection: "row",
  },
  available: {
    flexDirection: "row",
    display: "flex",
    flexGrow: 1,
  },
  availableRight: {
    alignItems: "center",
    justifyContent: "flex-end",
    flexDirection: "row",
  },
  availableLeft: {
    justifyContent: "center",
    flexGrow: 1,
  },
  maxLabel: {
    marginRight: 4,
  },
  switch: {
    opacity: 0.99,
  },
  valueLabel: { marginLeft: 4, fontSize: 14, lineHeight: 20 },
  label: {
    fontSize: 16,
    lineHeight: 19,
  },
  addAccountsection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 4,
    padding: 12,
    marginVertical: 10,
  },
  spacer: { flex: 0.5, flexShrink: 1, flexGrow: 1 },
  addAccountLabel: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  addAccountButton: { height: 40 },
  addAccountButtonLabel: { fontSize: 12 },
});