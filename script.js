document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    const defaultState = {
        projects: [],
        currentProjectId: null,
        preferences: {
            theme: 'light',
            sidebarCollapsed: true
        }
    };
    let state = JSON.parse(localStorage.getItem('revestmaster_state')) || defaultState;
    // Migration: ensure preferences exists
    if (!state.preferences) state.preferences = defaultState.preferences;
    let editingRoomId = null;

    const saveState = () => {
        localStorage.setItem('revestmaster_state', JSON.stringify(state));
    };

    const trashIconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

    // --- Selectors ---
    const projectList = document.getElementById('project-list');
    const newProjectBtn = document.getElementById('new-project-btn');
    const emptyNewProjectBtn = document.getElementById('empty-new-project-btn');
    const projectModal = document.getElementById('project-modal');
    const saveProjectBtn = document.getElementById('save-project-btn');
    const projectNameInput = document.getElementById('project-name-input');

    const projectDashboard = document.getElementById('project-dashboard');
    const emptyView = document.getElementById('empty-view');
    const currentProjectName = document.getElementById('current-project-name');
    const addRoomBtn = document.getElementById('add-room-btn');

    const roomModal = document.getElementById('room-modal');
    const roomModalTitle = document.getElementById('room-modal-title');
    const saveRoomBtn = document.getElementById('save-room-btn');
    const roomItemsContainer = document.getElementById('room-items-container');

    const closeModalBtns = document.querySelectorAll('.close-modal');
    const clearDataBtn = document.getElementById('clear-data-btn');
    const themeSelect = document.getElementById('theme-select');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsView = document.getElementById('settings-view');
    const homeBtn = document.getElementById('home-btn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const homeProjectsGrid = document.getElementById('home-projects-grid');
    const homeProjectsSection = document.querySelector('.home-projects-section');
    const checkUpdatesBtn = document.getElementById('check-updates-btn');
    const updateStatus = document.getElementById('update-status');

    // --- Calculation Engine ---
    const calculateMaterials = (roomData) => {
        const {
            length,
            width,
            tileLength_cm,
            tileWidth_cm,
            groutJoint_mm,
            wasteMargin_pct = 10,
            mortarConsumption_kg_m2 = 6,
            mortarBagWeight_kg = 20
        } = roomData;

        // --- Validação básica ---
        if (![length, width, tileLength_cm, tileWidth_cm].every(v => typeof v === 'number' && v > 0)) {
            throw new Error("Invalid input data");
        }

        // Área
        const area = length * width;
        const areaWithWaste = area * (1 + wasteMargin_pct / 100);

        // Azulejo
        const tileArea = (tileLength_cm / 100) * (tileWidth_cm / 100);
        const tiles = Math.ceil(areaWithWaste / tileArea);

        // Argamassa
        const mortarBags = Math.ceil(
            (areaWithWaste * mortarConsumption_kg_m2) / mortarBagWeight_kg
        );

        // Rejunte
        const L = tileLength_cm * 10;
        const W = tileWidth_cm * 10;
        const H = 8; // mm
        const J = groutJoint_mm;
        const density = 1.58;

        const groutConsumption = ((L + W) / (L * W)) * J * H * density;
        const groutKg = groutConsumption * areaWithWaste;

        return {
            area_m2: Number(area.toFixed(2)),
            area_with_waste_m2: Number(areaWithWaste.toFixed(2)),
            tiles_units: tiles,
            mortar_bags: mortarBags,
            grout_kg: Number(groutKg.toFixed(2))
        };
    };

    // --- UI Rendering ---
    const renderSidebar = () => {
        projectList.innerHTML = '';
        state.projects.forEach(project => {
            const li = document.createElement('li');
            li.className = `project-item ${state.currentProjectId === project.id ? 'active' : ''}`;
            li.innerHTML = `
                <span class="p-name">${project.name}</span>
                <button class="delete-project-btn" data-id="${project.id}">×</button>
            `;
            li.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-project-btn')) return;
                selectProject(project.id);
            });
            projectList.appendChild(li);
        });

        // Delete handlers
        document.querySelectorAll('.delete-project-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                deleteProject(btn.dataset.id);
            };
        });
    };

    const renderDashboard = () => {
        const project = state.projects.find(p => p.id === state.currentProjectId);
        if (!project) {
            showView('empty');
            addRoomBtn.classList.add('hidden');
            return;
        }

        emptyView.classList.remove('active');
        projectDashboard.classList.add('active');
        currentProjectName.textContent = project.name;
        addRoomBtn.classList.remove('hidden');

        // Calculate Totals
        let totals = { area: 0, tiles: 0, mortar: 0, grout: 0 };
        project.rooms.forEach(room => {
            totals.area += room.results.area_m2;
            totals.tiles += room.results.tiles_units;
            totals.mortar += room.results.mortar_bags;
            totals.grout += room.results.grout_kg;
        });

        document.getElementById('total-area').innerHTML = `${totals.area.toFixed(2)} <small>m²</small>`;
        document.getElementById('total-tiles').innerHTML = `${totals.tiles.toLocaleString()} <small>unid</small>`;
        document.getElementById('total-mortar').innerHTML = `${totals.mortar} <small>sacos</small>`;
        document.getElementById('total-grout').innerHTML = `${totals.grout.toFixed(1)} <small>kg</small>`;

        showView('dashboard');
        renderHomeProjects(); // Update home data in background

        // Render Room Cards
        roomItemsContainer.innerHTML = '';
        project.rooms.forEach(room => {
            const card = document.createElement('div');
            card.className = 'room-card';
            card.innerHTML = `
                <div class="room-info">
                    <h4>${room.name}</h4>
                    <p>${room.length}m x ${room.width}m | Piso ${room.tileLength_cm}x${room.tileWidth_cm}</p>
                </div>
                <div class="room-results">
                    <div class="res-item">
                        <span class="l">Área</span>
                        <span class="v">${room.results.area_m2.toFixed(2)} m²</span>
                    </div>
                    <div class="res-item">
                        <span class="l">Peças</span>
                        <span class="v">${room.results.tiles_units}</span>
                    </div>
                    <div class="res-item">
                        <span class="l">Cimento</span>
                        <span class="v">${room.results.mortar_bags} sacos (${room.mortarBagWeight_kg}kg)</span>
                    </div>
                    <div class="res-item">
                        <span class="l">Rejunte</span>
                        <span class="v">${room.results.grout_kg} kg</span>
                    </div>
                    <div class="room-actions">
                        <button class="trash-btn" data-room-id="${room.id}">${trashIconSvg}</button>
                    </div>
                </div>
            `;

            card.onclick = (e) => {
                if (e.target.closest('.trash-btn')) return;
                openRoomModal(room);
            };

            card.querySelector('.trash-btn').onclick = (e) => {
                e.stopPropagation();
                deleteRoom(room.id);
            };
            roomItemsContainer.appendChild(card);
        });
    };

    // --- Actions ---
    const selectProject = (id) => {
        state.currentProjectId = id;
        saveState();
        renderSidebar();
        renderDashboard();
    };

    const renderHomeProjects = () => {
        if (!homeProjectsGrid) return;
        homeProjectsGrid.innerHTML = '';

        if (state.projects.length === 0) {
            homeProjectsSection.style.display = 'none';
            return;
        }

        homeProjectsSection.style.display = 'block';
        state.projects.forEach(project => {
            const totalArea = project.rooms.reduce((acc, room) => acc + (room.results?.area_m2 || 0), 0);

            const card = document.createElement('div');
            card.className = 'summary-card';
            card.innerHTML = `
                <h4>${project.name}</h4>
                <div class="stats">
                    <span class="label">Área Total</span>
                    <span class="value">${totalArea.toFixed(2)} <small>m²</small></span>
                </div>
            `;
            card.onclick = () => selectProject(project.id);
            homeProjectsGrid.appendChild(card);
        });
    };

    const showView = (viewName) => {
        const views = {
            'dashboard': projectDashboard,
            'empty': emptyView,
            'settings': settingsView
        };

        Object.keys(views).forEach(name => {
            if (name === viewName) {
                views[name].classList.remove('hidden');
                views[name].classList.add('active');
            } else {
                views[name].classList.add('hidden');
                views[name].classList.remove('active');
            }
        });

        // Toggle sidebar button active states
        if (viewName === 'settings') {
            settingsBtn.classList.add('active');
            homeBtn.classList.remove('active');
            renderSidebar(); // refresh to remove active from projects
        } else if (viewName === 'empty') {
            settingsBtn.classList.remove('active');
            homeBtn.classList.add('active');
            renderSidebar();
        } else {
            settingsBtn.classList.remove('active');
            homeBtn.classList.remove('active');
        }
    };

    const applyTheme = (theme) => {
        const activeTheme = theme || 'light';
        document.documentElement.setAttribute('data-theme', activeTheme);
        if (themeSelect) themeSelect.value = activeTheme;

        // Sync with native title bar via Electron IPC
        if (window.electronAPI && window.electronAPI.setTheme) {
            window.electronAPI.setTheme(activeTheme);
        }
    };

    const toggleSidebar = (collapse) => {
        state.preferences.sidebarCollapsed = collapse !== undefined ? collapse : !state.preferences.sidebarCollapsed;
        if (state.preferences.sidebarCollapsed) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
        saveState();
    };

    const createProject = (name) => {
        const newProject = {
            id: Date.now().toString(),
            name: name || 'Projeto sem nome',
            rooms: []
        };
        state.projects.unshift(newProject);
        selectProject(newProject.id);
        projectModal.classList.remove('active');
        projectNameInput.value = '';
    };

    const deleteProject = (id) => {
        if (!confirm('Excluir este projeto e todos os seus cálculos?')) return;
        state.projects = state.projects.filter(p => p.id !== id);
        if (state.currentProjectId === id) {
            state.currentProjectId = state.projects.length > 0 ? state.projects[0].id : null;
        }
        saveState();
        renderSidebar();
        renderDashboard();
    };

    const deleteRoom = (roomId) => {
        if (!confirm('Excluir este compartimento?')) return;
        const project = state.projects.find(p => p.id === state.currentProjectId);
        if (!project) return;
        project.rooms = project.rooms.filter(r => r.id !== roomId);
        saveState();
        renderDashboard();
    };

    const openRoomModal = (room = null) => {
        if (room) {
            editingRoomId = room.id;
            roomModalTitle.textContent = 'Editar Compartimento';
            document.getElementById('room-name-input').value = room.name;
            document.getElementById('room-length').value = room.length;
            document.getElementById('room-width').value = room.width;
            document.getElementById('tile-length').value = room.tileLength_cm;
            document.getElementById('tile-width').value = room.tileWidth_cm;
            document.getElementById('grout-joint').value = room.groutJoint_mm;
            document.getElementById('waste-margin').value = room.wasteMargin_pct;
            document.getElementById('cement-weight').value = room.mortarBagWeight_kg || "20";
            saveRoomBtn.textContent = 'Salvar Alterações';
        } else {
            editingRoomId = null;
            roomModalTitle.textContent = 'Novo Compartimento';
            document.getElementById('room-name-input').value = '';
            document.getElementById('room-length').value = '';
            document.getElementById('room-width').value = '';
            document.getElementById('cement-weight').value = "20";
            saveRoomBtn.textContent = 'Calcular & Salvar';
        }
        roomModal.classList.add('active');
    };

    // --- Event Handlers ---
    newProjectBtn.onclick = () => projectModal.classList.add('active');
    emptyNewProjectBtn.onclick = () => projectModal.classList.add('active');

    saveProjectBtn.onclick = () => {
        if (projectNameInput.value.trim()) {
            createProject(projectNameInput.value.trim());
        }
    };

    addRoomBtn.onclick = () => openRoomModal();

    saveRoomBtn.onclick = () => {
        const name = document.getElementById('room-name-input').value || 'Compartimento';
        const length = parseFloat(document.getElementById('room-length').value);
        const width = parseFloat(document.getElementById('room-width').value);
        const tileL = parseFloat(document.getElementById('tile-length').value);
        const tileW = parseFloat(document.getElementById('tile-width').value);
        const joint = parseFloat(document.getElementById('grout-joint').value);
        const waste = parseFloat(document.getElementById('waste-margin').value);
        const cementWeight = parseInt(document.getElementById('cement-weight').value);

        if (isNaN(length) || isNaN(width) || isNaN(tileL) || isNaN(tileW)) {
            alert('Preencha os campos obrigatórios corretamente.');
            return;
        }

        const roomData = {
            length,
            width,
            tileLength_cm: tileL,
            tileWidth_cm: tileW,
            groutJoint_mm: joint,
            wasteMargin_pct: waste,
            mortarBagWeight_kg: cementWeight
        };
        const results = calculateMaterials(roomData);
        const project = state.projects.find(p => p.id === state.currentProjectId);

        if (editingRoomId) {
            const roomIdx = project.rooms.findIndex(r => r.id === editingRoomId);
            project.rooms[roomIdx] = { ...project.rooms[roomIdx], name, ...roomData, results };
        } else {
            const newRoom = { id: Date.now().toString(), name, ...roomData, results };
            project.rooms.push(newRoom);
        }

        saveState();
        roomModal.classList.remove('active');
        renderDashboard();
    };

    closeModalBtns.forEach(btn => {
        btn.onclick = () => {
            projectModal.classList.remove('active');
            roomModal.classList.remove('active');
        };
    });

    clearDataBtn.onclick = () => {
        if (confirm('Deseja apagar TODOS os seus projetos?')) {
            state = { projects: [], currentProjectId: null };
            saveState();
            renderSidebar();
            renderDashboard();
        }
    };

    settingsBtn.onclick = () => {
        state.currentProjectId = null;
        showView('settings');
    };

    homeBtn.onclick = () => {
        state.currentProjectId = null;
        renderSidebar();
        renderDashboard();
    };

    sidebarToggle.onclick = () => toggleSidebar();

    themeSelect.onchange = (e) => {
        state.preferences.theme = e.target.value;
        applyTheme(state.preferences.theme);
        saveState();
    };

    // Update functionality
    if (checkUpdatesBtn && window.electronAPI) {
        checkUpdatesBtn.onclick = () => {
            updateStatus.textContent = 'Verificando atualizações...';
            checkUpdatesBtn.disabled = true;
            window.electronAPI.checkForUpdates();
        };

        window.electronAPI.onUpdateAvailable((info) => {
            updateStatus.innerHTML = `Nova versão disponível: <strong>${info.version}</strong>. Baixando...`;
            window.electronAPI.downloadUpdate();
        });

        window.electronAPI.onUpdateNotAvailable(() => {
            updateStatus.textContent = 'Você já está usando a versão mais recente!';
            checkUpdatesBtn.disabled = false;
        });

        window.electronAPI.onDownloadProgress((progress) => {
            const percent = Math.round(progress.percent);
            updateStatus.textContent = `Baixando atualização: ${percent}%`;
        });

        window.electronAPI.onUpdateDownloaded(() => {
            updateStatus.innerHTML = 'Atualização baixada! <strong>Reinicie o aplicativo para instalar.</strong>';
            checkUpdatesBtn.textContent = 'Reiniciar e Atualizar';
            checkUpdatesBtn.disabled = false;
            checkUpdatesBtn.onclick = () => {
                window.electronAPI.installUpdate();
            };
        });
    }

    // Initialize
    applyTheme(state.preferences.theme);
    toggleSidebar(state.preferences.sidebarCollapsed);
    state.currentProjectId = null; // Always start on home page
    renderSidebar();
    renderDashboard();
    renderHomeProjects();
});
