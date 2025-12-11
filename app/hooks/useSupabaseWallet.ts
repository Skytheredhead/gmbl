'use client';

import {
  createClient,
  type PostgrestError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

const WALLET_ID_KEY = 'gmbl-wallet-id';
const BALANCE_KEY_PREFIX = 'gmbl-wallet-balance';
const TTL_MS = 1000 * 60 * 60 * 48; // 48 hours

type WalletMode = 'singleplayer' | 'multiplayer';

interface WalletOptions {
  mode: WalletMode;
  initialBalance: number;
}

interface WalletMeta {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function generateLocalId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function useWalletBalance({
  mode,
  initialBalance,
}: WalletOptions): [number, Dispatch<SetStateAction<number>>, WalletMeta] {
  const [balance, setBalance] = useState(initialBalance);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const walletIdRef = useRef<string | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const initializedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const ensureWalletId = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (walletIdRef.current) return walletIdRef.current;
    let stored = window.localStorage.getItem(WALLET_ID_KEY);
    if (!stored) {
      stored = generateLocalId();
      window.localStorage.setItem(WALLET_ID_KEY, stored);
    }
    walletIdRef.current = stored;
    return stored;
  }, []);

  const readLocalBalance = useCallback(() => {
    if (typeof window === 'undefined') return initialBalance;
    const key = `${BALANCE_KEY_PREFIX}:${mode}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      const record = { balance: initialBalance, updatedAt: Date.now() };
      window.localStorage.setItem(key, JSON.stringify(record));
      return initialBalance;
    }
    try {
      const parsed = JSON.parse(raw) as { balance?: unknown; updatedAt?: unknown };
      const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0;
      const value =
        typeof parsed.balance === 'number' ? parsed.balance : initialBalance;
      if (!updatedAt || Date.now() - updatedAt > TTL_MS) {
        const record = { balance: initialBalance, updatedAt: Date.now() };
        window.localStorage.setItem(key, JSON.stringify(record));
        return initialBalance;
      }
      return value;
    } catch {
      const record = { balance: initialBalance, updatedAt: Date.now() };
      window.localStorage.setItem(key, JSON.stringify(record));
      return initialBalance;
    }
  }, [initialBalance, mode]);

  const persistWalletRecord = useCallback(
    async (supabase: SupabaseClient, walletId: string, value: number) => {
      const nowIso = new Date().toISOString();

      const { data: updated, error: updateError } = await supabase
        .from('gmbl_wallets')
        .update({ balance: value, updated_at: nowIso })
        .eq('wallet_id', walletId)
        .eq('mode', mode)
        .select('id');

      if (updateError) {
        throw updateError;
      }

      if (!updated || updated.length === 0) {
        const { error: insertError } = await supabase
          .from('gmbl_wallets')
          .insert({ wallet_id: walletId, mode, balance: value, updated_at: nowIso });

        if (insertError) {
          const pgError = insertError as PostgrestError;
          if (pgError.code === '23505') {
            const { error: retryError } = await supabase
              .from('gmbl_wallets')
              .update({ balance: value, updated_at: nowIso })
              .eq('wallet_id', walletId)
              .eq('mode', mode);

            if (retryError) {
              throw retryError;
            }
          } else {
            throw insertError;
          }
        }
      }
    },
    [mode]
  );

  const loadBalance = useCallback(async () => {
    if (typeof window === 'undefined') return initialBalance;

    const key = `${BALANCE_KEY_PREFIX}:${mode}`;
    const walletId = ensureWalletId();
    let next = readLocalBalance();

    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supaUrl && supaKey) {
      if (!supabaseRef.current) {
        supabaseRef.current = createClient(supaUrl, supaKey);
      }
      const supabase = supabaseRef.current;

      if (supabase && walletId) {
        try {
          const cutoffIso = new Date(Date.now() - TTL_MS).toISOString();
          const { error: pruneError } = await supabase
            .from('gmbl_wallets')
            .delete()
            .eq('wallet_id', walletId)
            .eq('mode', mode)
            .lt('updated_at', cutoffIso);

          if (pruneError) {
            console.warn('Failed to prune stale gmbl wallet rows', pruneError);
          }

          const { data, error } = await supabase
            .from('gmbl_wallets')
            .select('balance, updated_at')
            .eq('wallet_id', walletId)
            .eq('mode', mode)
            .order('updated_at', { ascending: false })
            .limit(1);

          if (error) {
            throw error;
          }

          const record = data && data.length > 0 ? data[0] : null;

          if (record && typeof record.balance === 'number') {
            const lastUpdated = record.updated_at
              ? new Date(record.updated_at).getTime()
              : Date.now();
            if (Date.now() - lastUpdated > TTL_MS) {
              next = initialBalance;
            } else {
              next = record.balance;
            }
          }

          await persistWalletRecord(supabase, walletId, next);
          if (mountedRef.current) {
            setError(null);
          }
        } catch (err) {
          console.error('Failed to sync gmbl wallet', err);
          if (err instanceof Error) setError(err.message);
          else setError('Unknown error syncing wallet.');
        }
      }
    } else {
      setError(null);
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        key,
        JSON.stringify({ balance: next, updatedAt: Date.now() })
      );
    }

    return next;
  }, [ensureWalletId, initialBalance, mode, persistWalletRecord, readLocalBalance]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const bootstrap = async () => {
      setLoading(true);
      const value = await loadBalance();
      if (cancelled || !mountedRef.current) return;
      setBalance(value);
      initializedRef.current = true;
      setLoading(false);
    };

    const cached = readLocalBalance();
    setBalance(cached);
    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadBalance, readLocalBalance]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (typeof window !== 'undefined') {
      const key = `${BALANCE_KEY_PREFIX}:${mode}`;
      window.localStorage.setItem(
        key,
        JSON.stringify({ balance, updatedAt: Date.now() })
      );
    }

    const supabase = supabaseRef.current;
    const walletId = walletIdRef.current;
    if (!supabase || !walletId) return;

    let cancelled = false;

    const timeout = setTimeout(() => {
      const persist = async () => {
        try {
          await persistWalletRecord(supabase, walletId, balance);
          if (cancelled || !mountedRef.current) return;
          setError(null);
        } catch (err) {
          if (cancelled || !mountedRef.current) return;
          console.error('Failed to persist gmbl wallet', err);
          if (err instanceof Error) setError(err.message);
          else setError('Unknown error syncing wallet.');
        }
      };
      void persist();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [balance, mode, persistWalletRecord]);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    setLoading(true);
    const value = await loadBalance();
    if (!mountedRef.current) return;
    setBalance(value);
    initializedRef.current = true;
    setLoading(false);
  }, [loadBalance]);

  useEffect(() => {
    if (!error) return;
    if (typeof window === 'undefined') return;

    const id = window.setTimeout(() => {
      void refresh();
    }, 5000);

    return () => {
      window.clearTimeout(id);
    };
  }, [error, refresh]);

  return [balance, setBalance, { loading, error, refresh }];
}
