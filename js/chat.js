"use strict";
/* Balloon Defense — Chat (5.0): one chat room for everyone connected to the shared folder.
   Each message is one small file in <folder>/balloon-defense-chat/. Every PC lists that folder every few seconds and
   reads the files it hasn't seen. Messages older than 24 hours are deleted by whichever PC sees them first.
   No DOM access at load time, so the tests can load this file too. */
const CHAT_DIR = 'balloon-defense-chat';
const CHAT_FILE = /^c-(\d{12,14})-([a-z0-9]{6,20})-([a-z0-9]{1,8})\.json$/;
/** Why a text message can't be sent ('' = fine). Uses the same word filter as player names. */
function chatProblem(text) {
    const t = String(text || '').trim();
    if (!t)
        return 'Type a message first';
    if (t.length > CHAT_MAX)
        return 'Messages are up to ' + CHAT_MAX + ' characters';
    const flat = t.toLowerCase().replace(/[^a-z]/g, '');
    if (NAME_FILTER.some(w => flat.includes(w)))
        return 'Please keep it friendly: that message has a word that isn\'t allowed';
    return '';
}
/** A message as it is written to its file: who sent it (as their avatar, name and title looked then) and what. */
function chatMessage(id, title, body, at = Date.now()) {
    return { v: 1, at, uid: id.uid, name: id.name, tag: id.tag, animal: id.animal, style: id.style, bg: id.bg, border: id.border, title: title || '',
        kind: 'text', text: String(body.text || '').trim().slice(0, CHAT_MAX) };
}
/** Checks a message read from the folder; returns null when it isn't a valid one. */
function cleanChat(o) {
    if (!o || typeof o !== 'object' || typeof o.uid !== 'string' || !/^[a-z0-9]{6,20}$/.test(o.uid) || nameProblem(o.name))
        return null;
    const str = (x, n = 40) => (typeof x === 'string' ? x.slice(0, n) : '');
    if (o.kind === 'sticker' || typeof o.text !== 'string' || !o.text.trim() || chatProblem(o.text))
        return null; // stickers were removed: an old sticker message is skipped
    return { at: Math.max(0, +o.at || 0), uid: o.uid, name: String(o.name), tag: str(o.tag, 8), animal: str(o.animal) || 'fox', style: o.style === 'f' ? 'f' : 'm',
        bg: str(o.bg) || 'sky', border: str(o.border) || 'plain', title: str(o.title), kind: 'text', text: o.text.trim().slice(0, CHAT_MAX) };
}
const Chat = {
    /** Messages from the last 24 hours, oldest first. Each has `file` (its file name). */
    msgs: [],
    files: new Set(),
    lastSend: 0,
    started: Date.now(),
    busy: false,
    /** Lists the chat folder and reads new messages. Calls onChatMessages(newOnes) when there are some. */
    async poll(now = Date.now()) {
        if (this.busy || typeof Share === 'undefined' || !Share.connected())
            return [];
        this.busy = true;
        const fresh = [];
        try {
            const dir = await Share.handle.getDirectoryHandle(CHAT_DIR, { create: true }), names = [], old = [];
            for await (const [name, fh] of dir.entries()) {
                const m = CHAT_FILE.exec(name);
                if (!m || fh.kind !== 'file')
                    continue;
                if (now - +m[1] > CHAT_KEEP_MS)
                    old.push(name);
                else if (!this.files.has(name))
                    names.push([name, fh]);
            }
            for (const [name, fh] of names) {
                try {
                    const f = await fh.getFile();
                    if (f.size > 4000)
                        continue;
                    const msg = cleanChat(JSON.parse(await f.text()));
                    this.files.add(name);
                    if (msg) {
                        msg.file = name;
                        fresh.push(msg);
                    }
                }
                catch (e) { } // half-written: try again next time
            }
            for (const name of old)
                try {
                    await dir.removeEntry(name);
                }
                catch (e) { }
        }
        catch (e) { }
        this.busy = false;
        this.add(fresh, now);
        return fresh;
    },
    /** Adds messages (from a poll, or one just sent), drops the expired ones and tells the UI. */
    add(list, now = Date.now()) {
        if (list.length) {
            this.msgs = this.msgs.concat(list).sort((a, b) => a.at - b.at);
            if (typeof onChatMessages === 'function')
                onChatMessages(list);
        }
        this.msgs = this.msgs.filter(m => now - m.at <= CHAT_KEEP_MS);
    },
    /** Sends a text message ({ text }). Returns '' when sent, or why it wasn't. */
    async send(body, now = Date.now()) {
        const id = getId();
        if (!id || !activePlayable())
            return 'Create your profile first';
        if (!Share.connected())
            return 'Connect the shared folder in Settings to chat';
        const why = chatProblem(body.text);
        if (why)
            return why;
        if (now - this.lastSend < CHAT_GAP_MS)
            return 'Wait a moment before sending another message';
        const msg = chatMessage(id, currentTitle(id).name, body, now), name = 'c-' + now + '-' + id.uid + '-' + Math.random().toString(36).slice(2, 6) + '.json';
        try {
            const dir = await Share.handle.getDirectoryHandle(CHAT_DIR, { create: true });
            await writeText(dir, name, JSON.stringify(msg));
        }
        catch (e) {
            return 'Couldn\'t send: the shared folder isn\'t available';
        }
        this.lastSend = now;
        this.files.add(name);
        this.add([Object.assign(msg, { file: name })], now);
        return '';
    },
    unread(readAt) { const me = (getId() || {}).uid; return this.msgs.filter(m => m.at > readAt && m.uid !== me).length; }
};
