"use strict";
/*
 * NOTE: 生成物 server/console/register.js は本ファイルから `npm run build:console` で生成されます。
 *       編集はこの .ts 側で行ってください。
 *
 * 組織ごとのユーザー登録フォーム（register.html 用）。
 *   URL の ?org=<組織ID> で対象組織を指定し、登録コード＋ユーザー情報を送信して
 *   その組織にユーザーを自己登録します（selfRegister API）。
 *
 * ※ 全体を IIFE で囲み、コンソール(app.ts)とグローバル名が衝突しないようにしています。
 *   sha256 は sha256.js のグローバル関数を利用します。
 */
(function () {
    function $(id) {
        return document.getElementById(id);
    }
    function inp(id) {
        return $(id);
    }
    function getApiBase() {
        const saved = localStorage.getItem('pclc.apiBase');
        if (saved)
            return saved;
        return location.origin && location.origin !== 'null' ? location.origin + '/api' : '/api';
    }
    function getOrgId() {
        return (new URLSearchParams(location.search).get('org') || '').trim();
    }
    function showMsg(text, kind) {
        const el = $('msg');
        el.textContent = text;
        el.className = 'msg ' + kind;
        el.classList.remove('hidden');
    }
    async function submit() {
        const orgId = getOrgId();
        if (!orgId) {
            showMsg('URLに組織IDがありません。管理者から共有されたリンクを開いてください。', 'error');
            return;
        }
        const code = inp('code').value.trim();
        const userId = inp('userId').value.trim();
        const userName = inp('userName').value.trim();
        const pw = inp('pw').value;
        const pw2 = inp('pw2').value;
        if (!userId || !pw) {
            showMsg('ユーザーIDとパスワードは必須です。', 'error');
            return;
        }
        if (pw !== pw2) {
            showMsg('パスワードが一致しません。', 'error');
            return;
        }
        const btn = $('submitBtn');
        btn.disabled = true;
        try {
            const res = await fetch(getApiBase(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'selfRegister',
                    orgId,
                    registrationCode: code,
                    userId,
                    userName,
                    passwordHash: sha256(pw),
                }),
            });
            const text = await res.text();
            let r;
            try {
                r = JSON.parse(text);
            }
            catch {
                throw new Error('サーバー応答の解析に失敗しました');
            }
            if (r.success) {
                $('form').classList.add('hidden');
                $('done').classList.remove('hidden');
                $('msg').classList.add('hidden');
            }
            else {
                showMsg(r.message || '登録に失敗しました。', 'error');
            }
        }
        catch (e) {
            showMsg('通信エラー: ' + (e instanceof Error ? e.message : String(e)), 'error');
        }
        finally {
            btn.disabled = false;
        }
    }
    function init() {
        if (!getOrgId()) {
            showMsg('URLに組織IDがありません。管理者から共有されたリンクを開いてください。', 'error');
        }
        $('submitBtn').addEventListener('click', submit);
        inp('pw2').addEventListener('keydown', (e) => {
            if (e.key === 'Enter')
                submit();
        });
    }
    document.addEventListener('DOMContentLoaded', init);
})();
