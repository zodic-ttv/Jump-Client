const { ipcRenderer } = require('electron');

const settingsStyle = `
.kc-link { cursor: pointer; text-decoration: underline; }
.kc-link:hover { opacity: 0.8; }
.kc-star { color: #eb5656; }
.kc-star-blue { color: #5a6bc7; }
.kc-folder-row { cursor: pointer; }
.kc-chev { font-size: 20px; vertical-align: middle; }
.kc-indent { padding-left: 28px !important; }
.kc-toolbar { margin-bottom: 8px; }
.kc-inline { display: inline-flex; align-items: center; gap: 8px; }
.kc-gray-btn { display: inline-block; width: auto !important; min-width: 0 !important; max-width: none !important; float: none !important; margin: 0 !important; overflow: visible !important; text-overflow: clip !important; white-space: nowrap !important; background: #6a6a6a !important; color: #fff !important; }
.kc-gray-btn:hover { background: #808080 !important; }
.kc-has-desc { display: flex !important; justify-content: space-between; align-items: center; gap: 12px; height: auto !important; }
.kc-has-desc .floatR { float: none !important; flex-shrink: 0; }
.kc-desc { margin-top: 2px !important; font-size: 0.72em !important; font-weight: normal !important; line-height: 1.35 !important; letter-spacing: normal !important; text-transform: none !important; color: inherit !important; opacity: 0.75; }
`;

function createSettingsUi(settings, onSettingChanged) {
	const staticSections = [
		{
			title: 'Jump',
			items: [
				{ 
					type: 'link', 
					key: 'https://discord.gg/DCqJndAyD2', 
					label: 'Discord:' 
				},
				{ 
					type: 'link', 
					key: 'https://docs.google.com/spreadsheets/d/1tkLZKLukxAmc5_Ojqey5DKEK3Ync0HiWYy4ythlDED8/edit?usp=sharing', 
					label: 'Jump list:' 
				},
				{ 
					type: 'link', 
					key: 'https://docs.google.com/spreadsheets/d/1A2BN53JPHVO-P8HDVRZ6_DeqnRA20mktAKw5j4VneL0/edit#gid=1888109361', 
					label: 'Parkour maps list:' 
				},
				{ 
					type: 'toggle',
					key: 'jumpInfo', 
					label: 'Jump Info', 
					star: { title: 'Requires a reload (F5)' },
					desc: 'Replaces the trending now section of UI with jump info.'
				},
				{ 
					type: 'toggle',
					key: 'Editortweakstoggle', 
					label: 'Editor tweaks', 
					desc: 'Adds editor tweaks to the krunker editor.'
				},
			]
		},
		{
			title: 'Main',
			items: [
				{
					type: 'select',
					key: 'startMode',
					label: 'Start Mode',
					options: [
						['remember', 'Remember Previous'],
						['windowed', 'Windowed'],
						['maximized', 'Maximized'],
						['fullscreen', 'Fullscreen']
					]
				},
				{
					type: 'toggle',
					key: 'uncapFps',
					label: 'Uncap FPS',
					star: { title: 'Requires a restart' }
				},
				{
					type: 'toggle',
					key: 'rawInput',
					label: 'Glorp mouse handling',
					star: { title: 'Takes effect the next time you click into the game', blue: true },
					desc: 'Handles mouse movement as of glorp, turn this off if you didnt migrate from glorp.'
				},
				{
					type: 'folder',
					folder: 'scripts',
					label: 'Userscripts',
					star: { title: 'Requires a reload (F5)' }
				},
				{
					type: 'folder', 
					folder: 'css', 
					label: 'CSS' 
				}
			]
		},
		{
			title: 'UI',
			items: [
				{ type: 'toggle', key: 'selectableChat', label: 'Selectable Chat' },
		
			]
		},
		{
			title: 'Advanced',
			items: [
				{ type: 'toggle', key: 'gpuRasterization', label: 'GPU Rasterization', desc: 'Draws page content on the GPU instead of the CPU • Restart required', star: { title: 'Requires a restart' } },
				{ type: 'toggle', key: 'zeroCopy', label: 'Zero Copy', desc: 'Skips an extra memory copy when sending graphics to the GPU • Needs GPU Rasterization • Restart required', star: { title: 'Requires a restart' } },
				{ type: 'toggle', key: 'ignoreGpuBlocklist', label: 'Ignore GPU Blocklist', desc: 'Lets Chromium use your GPU even if it is on its blocklist • Restart required', star: { title: 'Requires a restart' } },
				{ type: 'toggle', key: 'quic', label: 'QUIC', desc: 'Allows the UDP-based QUIC protocol for normal web requests • Restart required', star: { title: 'Requires a restart' } },
				{ type: 'toggle', key: 'highPerformanceGpu', label: 'High Performance GPU', desc: 'Prefers your dedicated GPU on laptops with two graphics chips • Restart required', star: { title: 'Requires a restart' } },
				{
					type: 'select',
					key: 'angleBackend',
					label: 'ANGLE Backend',
					desc: 'Graphics API used to render the game. Leave on Default unless something is wrong • Restart required',
					star: { title: 'Requires a restart' },
					options: [
						['default', 'Default'],
						['d3d11', 'D3D11'],
						['gl', 'OpenGL'],
						['d3d11on12', 'D3D11on12']
					]
				}
			]
		}
	];
	
	function el(tag, props, children) {
		const node = document.createElement(tag);
		Object.assign(node, props || {});
		for (const child of children || []) node.append(child);
		return node;
	}

	function star(title, blue) {
		return el('span', {
			className: blue ? 'kc-star kc-star-blue' : 'kc-star',
			textContent: ' *',
			title
		});
	}

	function row(left, right) {
		const node = el('div', { className: 'settName' }, [left]);
		if (right) node.append(el('span', { className: 'floatR' }, [right]));
		return node;
	}

	function makeSwitch(checked, onChange) {
		const input = el('input', { type: 'checkbox', checked });
		input.onchange = () => onChange(input.checked);
		return el('label', { className: 'switch' }, [
			input,
			el('span', { className: 'slider' })
		]);
	}
	async function fillList(list, type) {
		list.textContent = '';
		const files = await ipcRenderer.invoke('files:list', type);

		if (!files.length) {
			const empty = row(document.createTextNode('No files in this folder yet'));
			empty.classList.add('kc-indent');
			list.append(empty);
			return;
		}

		for (const file of files) {
			const link = el('span', { className: 'kc-link', textContent: file.name });
			link.onclick = () => ipcRenderer.invoke('files:open', type, file.name);

			const toggle = makeSwitch(file.enabled, (value) =>
				ipcRenderer.invoke('files:toggle', type, file.name, value)
			);

			const node = row(link, toggle);
			node.classList.add('kc-indent');
			list.append(node);
		}
	}

	function buildFolderRow(item) {
		const icon = el('span', {
			className: 'material-icons kc-chev',
			textContent: 'keyboard_arrow_down'
		});
		const labelNodes = [icon, document.createTextNode(' ' + item.label)];
		if (item.star) labelNodes.push(star(item.star.title, item.star.blue));

		const folderBtn = el('div', { className: 'settingsBtn', textContent: 'Open Folder' });
		folderBtn.onclick = (event) => {
			event.stopPropagation();
			ipcRenderer.invoke('files:folder', item.folder);
		};

		const head = row(el('span', {}, labelNodes), folderBtn);
		head.classList.add('kc-folder-row');

		const list = el('div', {});
		fillList(list, item.folder);

		head.onclick = () => {
			const opening = list.style.display === 'none';
			list.style.display = opening ? 'block' : 'none';
			icon.textContent = opening ? 'keyboard_arrow_down' : 'keyboard_arrow_right';
			if (opening) fillList(list, item.folder);
		};

		return el('div', {}, [head, list]);
	}

	function finishRow(item, label, control) {
		if (!item.desc) return row(label, control);
		const left = el('div', {}, [label, el('div', { className: 'kc-desc', textContent: item.desc })]);
		const node = row(left, control);
		node.classList.add('kc-has-desc');
		requestAnimationFrame(() => {
		const ref = document.querySelector('.kc-panel .settName:not(.kc-has-desc)');
		if (!ref) return;
		const style = getComputedStyle(ref);
		for (const prop of ['color', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing']) {
			left.style[prop] = style[prop];
		}
		});
		return node;
  	}

	function buildRow(item) {
		if (item.type === 'folder') return buildFolderRow(item);

		if (item.type === 'link') {
			const button = el('div', { className: 'settingsBtn', textContent: 'Open' });
			button.onclick = () => window.open(item.key, '_blank');
			return finishRow(item, document.createTextNode(item.label), button);
		}

		const labelNodes = [document.createTextNode(item.label)];
		if (item.star) labelNodes.push(star(item.star.title, item.star.blue));
		const label = el('span', {}, labelNodes);

		if (item.type === 'select') {
			const select = el(
				'select',
				{ className: 'inputGrey2' },
				item.options.map(([value, text]) => el('option', { value, textContent: text }))
			);
			select.value = settings[item.key];
			select.onchange = () => onSettingChanged(item.key, select.value);
			return finishRow(item, label, select);
		}

		const toggle = makeSwitch(settings[item.key], (value) => onSettingChanged(item.key, value));
		return finishRow(item, label, toggle);
  	}

	function buildStaticSection(def) {
		const icon = el('span', {
			className: 'material-icons plusOrMinus',
			textContent: 'keyboard_arrow_down'
		});
		const head = el('div', { className: 'setHed' }, [
			icon,
			document.createTextNode(' ' + def.title)
		]);
		const body = el('div', { className: 'setBodH' }, def.items.map(buildRow));

		head.onclick = () => {
			const opening = body.style.display === 'none';
			body.style.display = opening ? 'block' : 'none';
			icon.textContent = opening ? 'keyboard_arrow_down' : 'keyboard_arrow_right';
		};

		return el('div', {}, [head, body]);
	}

	function getTabs() {
		const layout = document.querySelector('#settingsTabLayout');
		if (!layout) return [];
		const tabs = [...layout.querySelectorAll('.settingTab')];
		return tabs.length ? tabs : [...layout.children];
	}

	function activeTabText() {
		const tabs = getTabs();
		if (tabs.length < 3) return '';

		const counts = new Map();
		for (const tab of tabs) {
			for (const name of tab.classList) {
				counts.set(name, (counts.get(name) || 0) + 1);
			}
		}

		const active = tabs.find((tab) =>
			[...tab.classList].some((name) => counts.get(name) === 1)
		);
		return active ? active.textContent.toLowerCase() : '';
	}

	function buildToolbar() {
		const reload = el('div', { className: 'settingsBtn kc-gray-btn', textContent: 'Reload' });
		reload.onclick = () => location.reload();

		const relaunch = el('div', { className: 'settingsBtn kc-gray-btn', textContent: 'Relaunch' });
		relaunch.onclick = () => ipcRenderer.invoke('app:relaunch');

		const close = el('div', { className: 'settingsBtn kc-gray-btn', textContent: 'Close' });
		close.onclick = () => ipcRenderer.invoke('app:quit');

		const left = el('span', { className: 'kc-inline' }, [reload, relaunch]);
		return el('div', { className: 'setBodH kc-toolbar' }, [row(left, close)]);
  	}

	function hideEmptyNotice(holder) {
		if (!/no settings found/i.test(holder.textContent)) return;

		const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			const node = walker.currentNode;
			if (!/no settings found/i.test(node.nodeValue)) continue;

			const target = node.parentElement;
			if (!target || target.closest('.kc-panel')) continue;

			if (target === holder) {
				node.nodeValue = '';
			} else {
				target.style.display = 'none';
			}
		}
	}

	function ensureSections() {
		const holder = document.querySelector('#settHolder');
		if (!holder) return;

		const panel = holder.querySelector('.kc-panel');
		const onClientTab = activeTabText().includes('client');

		if (onClientTab && !panel) {
			    holder.append(
					el('div', { className: 'kc-panel' }, [buildToolbar(), ...staticSections.map(buildStaticSection)])
				);
		} else if (!onClientTab && panel) {
			panel.remove();
		}

		if (onClientTab) hideEmptyNotice(holder);
	}
  return { ensureSections };
}

module.exports = { createSettingsUi, settingsStyle };