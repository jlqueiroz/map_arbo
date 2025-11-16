// =============================================
// CONFIGURAÇÃO DE CAMADAS PREDEFINIDAS
// =============================================

// Defina aqui os caminhos para seus arquivos KML
const CAMADAS_PREDEFINIDAS = [
    {
        nome: "Limites Municipais",
        url: "caminho/para/seu/arquivo1.kml",
        visivel: true,
        cor: "#3498db"
    },
    {
        nome: "Áreas de Preservação", 
        url: "caminho/para/seu/arquivo2.kml",
        visivel: true,
        cor: "#27ae60"
    },
    {
        nome: "Zoneamento Urbano",
        url: "caminho/para/seu/arquivo3.kml",
        visivel: false,
        cor: "#e74c3c"
    }
    // Adicione mais camadas conforme necessário
];

// =============================================
// INICIALIZAÇÃO DO MAPA E VARIÁVEIS GLOBAIS
// =============================================

// Inicialização do mapa
const mapa = L.map('map').setView([-23.5664559, -46.5776674], 18);

// Adicionar camada do OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © AnaqMaps'
}).addTo(mapa);

// Variáveis globais
let marcador = null;
let circulo = null;
let drawnItems = new L.FeatureGroup();
mapa.addLayer(drawnItems);

let drawControl = null;
let drawControlActive = false;
let polygons = [];
let polygonLabels = [];
let importedKmlLayers = [];
let kmlLayers = [];
let isDraggingEnabled = false;
let isLabelDraggingEnabled = false;
let selectedPolygonIds = [];
let molduraVisivel = false;
let polygonManagerExpanded = false;

// =============================================
// FUNÇÕES PARA MENU MOBILE
// =============================================

function toggleMobileMenu() {
    const toolsPanel = document.getElementById('toolsPanel');
    const overlay = document.getElementById('overlay');
    
    toolsPanel.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
}

function closeMobileMenu() {
    const toolsPanel = document.getElementById('toolsPanel');
    const overlay = document.getElementById('overlay');
    
    toolsPanel.classList.remove('mobile-open');
    overlay.classList.remove('active');
}

// Event listeners para menu mobile
document.getElementById('mobileMenuToggle').addEventListener('click', toggleMobileMenu);
document.getElementById('overlay').addEventListener('click', closeMobileMenu);

// Fechar menu ao redimensionar para desktop
window.addEventListener('resize', function() {
    if (window.innerWidth >= 768) {
        closeMobileMenu();
    }
});

// =============================================
// FUNÇÕES PARA GERENCIAR VISIBILIDADE DO PAINEL DE POLÍGONOS
// =============================================

// Função para alternar a visibilidade do gerenciador de polígonos
function togglePolygonManager() {
    const content = document.getElementById('polygonManagerContent');
    const headerIcon = document.querySelector('.polygon-manager-header .fa-chevron-down');
    
    if (polygonManagerExpanded) {
        // Recolher
        content.classList.add('collapsed');
        headerIcon.style.transform = 'rotate(0deg)';
        polygonManagerExpanded = false;
    } else {
        // Expandir
        content.classList.remove('collapsed');
        headerIcon.style.transform = 'rotate(180deg)';
        polygonManagerExpanded = true;
    }
}

// Função para atualizar o contador de polígonos
function atualizarContadorPoligonos() {
    const polygonCount = document.getElementById('polygonCount');
    polygonCount.textContent = polygons.length;
    
    // Mostrar/ocultar o contador baseado na quantidade
    if (polygons.length === 0) {
        polygonCount.style.display = 'none';
    } else {
        polygonCount.style.display = 'flex';
    }
}

// =============================================
// FUNÇÃO PARA CARREGAR CAMADAS PREDEFINIDAS
// =============================================

// Função para carregar uma camada KML individual
function carregarCamadaKML(camadaConfig) {
    return new Promise((resolve, reject) => {
        if (!camadaConfig.url || camadaConfig.url.includes("caminho/para/seu/arquivo")) {
            reject(new Error(`URL não definida para a camada: ${camadaConfig.nome}`));
            return;
        }

        // Carregar o arquivo KML usando omnivore
        const kml = omnivore.kml(camadaConfig.url)
            .on('ready', function() {
                const layerId = 'predefinida_' + Date.now();
                kml._kmlLayerId = layerId;

                // Aplicar estilo personalizado se especificado
                if (camadaConfig.cor) {
                    kml.eachLayer(layer => {
                        if (layer instanceof L.Polygon) {
                            layer.setStyle({
                                fillColor: camadaConfig.cor,
                                fillOpacity: 0.25,
                                color: camadaConfig.cor,
                                weight: 2
                            });
                        }
                    });
                }

                // Adicionar ao mapa se estiver configurado como visível
                if (camadaConfig.visivel) {
                    mapa.addLayer(kml);
                }

                // Adicionar controle da camada (inicialmente oculto)
                adicionarControleCamada(layerId, camadaConfig.nome, kml, camadaConfig.visivel);

                // Processar polígonos do KML
                kml.eachLayer(layer => {
                    if (layer instanceof L.Polygon) {
                        const polygonId = layerId + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                        
                        layer.polygonId = polygonId;
                        layer._kmlLayerId = layerId;

                        const polygonData = {
                            id: polygonId,
                            layer: layer,
                            name: layer.feature?.properties?.name || camadaConfig.nome,
                            type: 'imported',
                            visible: camadaConfig.visivel || true
                        };

                        polygons.push(polygonData);
                        
                        if (camadaConfig.visivel) {
                            drawnItems.addLayer(layer);
                        }

                        // Configurar evento de clique para seleção
                        configurarCliquePoligono(layer);

                        layer.bindPopup(`
                            <b>${polygonData.name}</b><br>
                            <em>${camadaConfig.nome}</em><br>
                            <button onclick="adicionarRotuloParaPoligono('${polygonId}')">Adicionar/Editar Rótulo</button>
                            
                        `);
                    }
                });

                // Atualizar contador de polígonos
                atualizarContadorPoligonos();

                resolve({
                    id: layerId,
                    nome: camadaConfig.nome,
                    layer: kml,
                    config: camadaConfig
                });
            })
            .on('error', function(error) {
                console.error(`Erro ao carregar camada ${camadaConfig.nome}:`, error);
                reject(error);
            });
    });
}

// Função para carregar todas as camadas predefinidas
function carregarCamadasPredefinidas() {
    const camadasComURL = CAMADAS_PREDEFINIDAS.filter(camada => 
        camada.url && !camada.url.includes("caminho/para/seu/arquivo")
    );
    
    if (camadasComURL.length === 0) {
        alert('Configure os caminhos dos arquivos KML na variável CAMADAS_PREDEFINIDAS no código.');
        return;
    }

    let carregadasComSucesso = 0;
    const totalCamadas = camadasComURL.length;

    camadasComURL.forEach(camadaConfig => {
        carregarCamadaKML(camadaConfig)
            .then(resultado => {
                carregadasComSucesso++;
                console.log(`Camada carregada: ${resultado.nome}`);
                
                if (carregadasComSucesso === totalCamadas) {
                    atualizarListaPoligonos();
                    atualizarControlesPoligonos();
                    alert(`Todas as ${totalCamadas} camadas predefinidas foram carregadas com sucesso!`);
                }
            })
            .catch(error => {
                console.error(`Falha ao carregar camada ${camadaConfig.nome}:`, error);
                alert(`Erro ao carregar camada "${camadaConfig.nome}": ${error.message}`);
            });
    });
    
    closeMobileMenu();
}

// Função para carregar uma camada específica por URL
function carregarCamadaPorURL(url, nome, visivel = true, cor = null) {
    const camadaConfig = {
        nome: nome || `Camada ${Date.now()}`,
        url: url,
        visivel: visivel,
        cor: cor
    };

    return carregarCamadaKML(camadaConfig);
}

// =============================================
// FUNÇÕES EXISTENTES (mantidas do código anterior)
// =============================================

// Função para mostrar/ocultar a moldura de impressão
function toggleMolduraImpressao() {
    const moldura = document.getElementById('printFrame');
    const label = document.getElementById('printFrameLabel');
    const orientacao = document.getElementById('orientacao')?.value || 'portrait';
    
    if (!molduraVisivel) {
        moldura.style.display = 'block';
        label.style.display = 'block';
        
        moldura.className = 'print-frame';
        if (orientacao === 'portrait') {
            moldura.classList.add('a4-portrait');
        } else {
            moldura.classList.add('a4-landscape');
        }
        
        molduraVisivel = true;
        
        alert('Moldura A4 visível. Arraste o mapa para centralizar o conteúdo na área de impressão.');
    } else {
        moldura.style.display = 'none';
        label.style.display = 'none';
        molduraVisivel = false;
    }
    
    // Fechar menu mobile após ação
    closeMobileMenu();
}

// Função para centralizar o mapa na moldura
function centralizarNaMoldura() {
    if (!molduraVisivel) {
        alert('Primeiro ative a moldura de impressão.');
        return;
    }
    
    const moldura = document.getElementById('printFrame');
    const molduraRect = moldura.getBoundingClientRect();
    const mapRect = document.getElementById('map').getBoundingClientRect();
    
    const centerX = molduraRect.left - mapRect.left + molduraRect.width / 2;
    const centerY = molduraRect.top - mapRect.top + molduraRect.height / 2;
    
    const centerPoint = mapa.containerPointToLatLng([centerX, centerY]);
    mapa.setView(centerPoint, mapa.getZoom());
    
    alert('Mapa centralizado na área de impressão.');
}

// Função modificada para adicionar controle de camada (inicialmente oculto)
function adicionarControleCamada(layerId, nomeCamada, layer, visivel = true) {
    const layerControls = document.getElementById('layer-controls');
    
    const controlDiv = document.createElement('div');
    controlDiv.className = 'layer-control';
    controlDiv.id = `layer-control-${layerId}`;
    
    const toggleText = visivel ? 'Visível' : 'Oculta';
    const toggleClass = visivel ? '' : 'hidden';
    
    controlDiv.innerHTML = `
        <span class="layer-name">${nomeCamada}</span>
        <button class="layer-toggle ${toggleClass}" onclick="toggleCamada('${layerId}')">${toggleText}</button>
        <button class="layer-remove" onclick="removerCamada('${layerId}')">×</button>
    `;
    
    layerControls.appendChild(controlDiv);
    
    kmlLayers.push({
        id: layerId,
        name: nomeCamada,
        layer: layer,
        visible: visivel
    });
}

// Função para criar um rótulo customizado e arrastável com TAMANHO FIXO (inicialmente oculto)
function criarRotuloCustomizado(latlng, texto, polygonId, isKml = false) {
    const className = isKml ? 'kml-label' : 'custom-label';
    
    const labelDiv = L.divIcon({
        className: `${className} transparent`, // Inicialmente transparente
        html: `<div style="width: 150px; height: 35px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold;">${texto}</div>`,
        iconSize: [150, 35],
        iconAnchor: [75, 17.5]
    });

    const marker = L.marker(latlng, { 
        icon: labelDiv,
        draggable: true
    }).addTo(mapa);

    marker.polygonId = polygonId;
    marker.isKmlLabel = isKml;

    // Todos os rótulos começam ocultos (transparentes)
    marker.getElement().classList.add('transparent');

    marker.on('dragstart', function() {
        this.getElement().classList.remove('transparent');
        this.getElement().classList.add('dragging');
    });

    marker.on('dragend', function() {
        this.getElement().classList.remove('dragging');
        if (!selectedPolygonIds.includes(polygonId)) {
            this.getElement().classList.add('transparent');
        }
    });

    let popupContent = `
        <b>${texto}</b><br>
        <em>Rótulo ${isKml ? 'KML' : 'do polígono'}</em><br>
        <button onclick="adicionarRotuloParaPoligono('${polygonId}')">Editar Rótulo</button>
        
    `;
    
    if (!isKml) {
        popupContent += `<button onclick="centralizarRotulo('${polygonId}')">Centralizar no Polígono</button>`;
    }

    marker.bindPopup(popupContent);

    return marker;
}

// Função para atualizar transparência dos rótulos
function atualizarTransparenciaRotulos() {
    polygonLabels.forEach(labelData => {
        const labelElement = labelData.layer.getElement();
        if (selectedPolygonIds.includes(labelData.polygonId)) {
            labelElement.classList.remove('transparent');
        } else {
            labelElement.classList.add('transparent');
        }
    });
}

// Função para buscar endereço e desenhar o círculo
function buscarEndereco() {
    const endereco = document.getElementById('endereco').value;
    if (!endereco) {
        alert("Por favor, insira um endereço.");
        return;
    }

    const button = event.target.closest('button');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span class="btn-text">Buscando...</span>';
    button.disabled = true;

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}`)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);

                if (marcador) {
                    mapa.removeLayer(marcador);
                }
                if (circulo) {
                    mapa.removeLayer(circulo);
                }

                marcador = L.marker([lat, lon]).addTo(mapa)
                    .bindPopup(`<b>Endereço:</b><br>${endereco}`)
                    .openPopup();

                circulo = L.circle([lat, lon], {
                    radius: 150,
                    color: 'black',			    
                    fillColor: 'none',
                    fillOpacity: 0.3
                }).addTo(mapa);

                mapa.setView([lat, lon], 18);
            } else {
                alert("Endereço não encontrado.");
            }
            
            button.innerHTML = originalText;
            button.disabled = false;
        })
        .catch(error => {
            console.error("Erro ao buscar endereço:", error);
            alert("Erro ao buscar endereço. Tente novamente.");
            button.innerHTML = originalText;
            button.disabled = false;
        });
}

// Função para ativar desenho de polígonos
function ativarDesenhoPoligono() {
    if (drawControlActive && drawControl) {
        mapa.removeControl(drawControl);
        drawControlActive = false;
        alert('Modo de desenho desativado.');
        return;
    }

    drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
            polygon: {
                shapeOptions: {
                    color: '#808070',
                    fillColor: '#808070',
                    fillOpacity: 0.25,
                    weight: 2
                },
                allowIntersection: false,
                showArea: true,
                metric: true
            },
            polyline: false,
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    
    mapa.addControl(drawControl);
    drawControlActive = true;
    
    mapa.on(L.Draw.Event.CREATED, function (e) {
        const layer = e.layer;
        drawnItems.addLayer(layer);
        
        const polygonId = 'polygon_' + Date.now();
        layer.polygonId = polygonId;
        
        const polygonData = {
            id: polygonId,
            layer: layer,
            name: 'Polígono ' + (polygons.length + 1),
            type: 'drawn',
            visible: true
        };
        
        polygons.push(polygonData);
        
        // Configurar evento de clique para seleção
        configurarCliquePoligono(layer);
        
        layer.bindPopup(`<b>${polygonData.name}</b><br>Clique com o botão direito para opções`);
        atualizarListaPoligonos();
        atualizarControlesPoligonos();
        alert('Polígono desenhado! Agora você pode adicionar um rótulo a ele.');
    });

    mapa.on(L.Draw.Event.DELETED, function (e) {
        const layers = e.layers;
        layers.eachLayer(function (layer) {
            if (layer.polygonId) {
                const polygonId = layer.polygonId;
                polygons = polygons.filter(p => p.id !== polygonId);
                
                // Remover da seleção se estiver selecionado
                selectedPolygonIds = selectedPolygonIds.filter(id => id !== polygonId);
                
                const labelIndex = polygonLabels.findIndex(label => label.polygonId === polygonId);
                if (labelIndex !== -1) {
                    mapa.removeLayer(polygonLabels[labelIndex].layer);
                    polygonLabels.splice(labelIndex, 1);
                }
            }
        });
        atualizarListaPoligonos();
        atualizarControlesPoligonos();
    });
    
    alert('Modo de desenho ativado. Use as ferramentas no canto superior direito para desenhar polígonos.');
}

// Função para configurar clique nos polígonos para seleção MÚLTIPLA
function configurarCliquePoligono(layer) {
    layer.on('click', function(e) {
        const polygonId = layer.polygonId;
        selecionarPoligono(polygonId);
    });
}

// Função para selecionar/desselecionar um polígono (SELEÇÃO MÚLTIPLA)
function selecionarPoligono(polygonId) {
    const polygon = polygons.find(p => p.id === polygonId);
    if (!polygon) return;

    const index = selectedPolygonIds.indexOf(polygonId);
    
    if (index === -1) {
        // Selecionar polígono
        selectedPolygonIds.push(polygonId);
        
        // Aplicar estilo de seleção (preto com 25% de opacidade, sem borda)
        polygon.layer.setStyle({
            fillColor: 'black',
            fillOpacity: 0.25,
            color: 'transparent',
            weight: 0
        });
    } else {
        // Desselecionar polígono
        selectedPolygonIds.splice(index, 1);
        
        // Aplicar estilo padrão baseado no tipo de polígono
        if (polygon.type === 'imported') {
            // Para polígonos KML: voltar para transparente
            polygon.layer.setStyle({
                fillColor: 'transparent',
                fillOpacity: 0,
                color: 'transparent',
                weight: 0
            });
        } else {
            // Para polígonos desenhados: voltar para estilo original
            polygon.layer.setStyle({
                fillColor: '#808070',
                fillOpacity: 0.25,
                color: '#808070',
                weight: 2
            });
        }
    }
    
    // Atualizar controles visuais
    atualizarControlesPoligonos();
    atualizarTransparenciaRotulos();
}

// Função para atualizar a lista de polígonos no seletor
function atualizarListaPoligonos() {
    const select = document.getElementById('poligonoSelecionado');
    select.innerHTML = '<option value="">-- Selecione um polígono --</option>';
    
    polygons.forEach(polygon => {
        const option = document.createElement('option');
        option.value = polygon.id;
        option.textContent = polygon.name + (polygon.type === 'imported' ? ' (Importado)' : ' (Desenhado)');
        select.appendChild(option);
    });
}

// Função para atualizar controles de polígonos
function atualizarControlesPoligonos() {
    const polygonControls = document.getElementById('polygon-controls');
    polygonControls.innerHTML = '';
    
    if (polygons.length === 0) {
        polygonControls.innerHTML = '<p style="color: #666; font-style: italic; text-align: center; padding: 10px;">Nenhum polígono adicionado</p>';
    } else {
        polygons.forEach(polygon => {
            const controlDiv = document.createElement('div');
            controlDiv.className = 'polygon-control';
            controlDiv.id = `polygon-control-${polygon.id}`;
            
            if (selectedPolygonIds.includes(polygon.id)) {
                controlDiv.classList.add('selected');
            }
            
            const toggleText = polygon.visible ? 'Visível' : 'Oculto';
            const toggleClass = polygon.visible ? '' : 'hidden';
            
            controlDiv.innerHTML = `
                <span class="polygon-name" onclick="selecionarPoligono('${polygon.id}')">${polygon.name}</span>
                <button class="polygon-toggle ${toggleClass}" onclick="togglePoligono('${polygon.id}')">${toggleText}</button>
                
            `;
            
            polygonControls.appendChild(controlDiv);
        });
    }
    
    // Atualizar o contador
    atualizarContadorPoligonos();
}

// Função para alternar visibilidade de um polígono e seus rótulos
function togglePoligono(polygonId) {
    const polygonIndex = polygons.findIndex(p => p.id === polygonId);
    if (polygonIndex !== -1) {
        const polygon = polygons[polygonIndex];
        const button = document.querySelector(`#polygon-control-${polygonId} .polygon-toggle`);
        
        if (polygon.visible) {
            // Ocultar polígono e rótulos
            mapa.removeLayer(polygon.layer);
            button.textContent = 'Oculto';
            button.classList.add('hidden');
            polygon.visible = false;
            
            // Ocultar todos os rótulos associados a este polígono
            const labelsAssociados = polygonLabels.filter(label => label.polygonId === polygonId);
            labelsAssociados.forEach(labelData => {
                mapa.removeLayer(labelData.layer);
            });
            
        } else {
            // Mostrar polígono e rótulos
            mapa.addLayer(polygon.layer);
            button.textContent = 'Visível';
            button.classList.remove('hidden');
            polygon.visible = true;
            
            // Mostrar todos os rótulos associados a este polígono
            const labelsAssociados = polygonLabels.filter(label => label.polygonId === polygonId);
            labelsAssociados.forEach(labelData => {
                mapa.addLayer(labelData.layer);
            });
            
            // Aplicar estilo correto baseado na seleção
            if (selectedPolygonIds.includes(polygonId)) {
                polygon.layer.setStyle({
                    fillColor: 'black',
                    fillOpacity: 0.25,
                    color: 'transparent',
                    weight: 0
                });
            } else {
                // Se não for selecionado, aplicar estilo padrão baseado no tipo
                if (polygon.type === 'imported') {
                    polygon.layer.setStyle({
                        fillColor: 'transparent',
                        fillOpacity: 0,
                        color: 'transparent',
                        weight: 0
                    });
                }
            }
        }
        
        atualizarTransparenciaRotulos();
    }
}

// Função para centralizar no polígono
function centralizarNoPoligono(polygonId) {
    const polygon = polygons.find(p => p.id === polygonId);
    if (polygon && polygon.visible) {
        mapa.fitBounds(polygon.layer.getBounds());
    }
}

// Função para remover polígono individual
function removerPoligonoIndividual(polygonId) {
    const polygonIndex = polygons.findIndex(p => p.id === polygonId);
    if (polygonIndex !== -1) {
        const polygon = polygons[polygonIndex];
        
        // Remover do mapa
        mapa.removeLayer(polygon.layer);
        
        // Remover todos os rótulos associados
        const labelsParaRemover = polygonLabels.filter(label => label.polygonId === polygonId);
        labelsParaRemover.forEach(labelData => {
            mapa.removeLayer(labelData.layer);
        });
        
        // Remover da lista de rótulos
        polygonLabels = polygonLabels.filter(label => label.polygonId !== polygonId);
        
        // Remover da lista de polígonos
        polygons.splice(polygonIndex, 1);
        
        // Remover da seleção se estiver selecionado
        selectedPolygonIds = selectedPolygonIds.filter(id => id !== polygonId);
        
        // Atualizar controles
        atualizarListaPoligonos();
        atualizarControlesPoligonos();
        atualizarTransparenciaRotulos();
        
        alert('Polígono removido: ' + polygon.name);
    }
}

// Função para alternar opções de rótulo
function toggleLabelOptions() {
    const labelOptions = document.getElementById('labelOptions');
    if (labelOptions.style.display === 'block') {
        labelOptions.style.display = 'none';
    } else {
        labelOptions.style.display = 'block';
        atualizarListaPoligonos();
    }
}

// Função para adicionar rótulo a um polígono
function adicionarRotulo() {
    const polygonId = document.getElementById('poligonoSelecionado').value;
    const nome = document.getElementById('nomePoligono').value;
    
    if (!polygonId) {
        alert("Por favor, selecione um polígono.");
        return;
    }
    
    if (!nome) {
        alert("Por favor, digite um nome para o polígono.");
        return;
    }
    
    adicionarRotuloParaPoligono(polygonId, nome);
    
    document.getElementById('nomePoligono').value = '';
    document.getElementById('poligonoSelecionado').value = '';
}

// Função para adicionar rótulo a um polígono específico
function adicionarRotuloParaPoligono(polygonId, nome) {
    const polygon = polygons.find(p => p.id === polygonId);
    if (!polygon) {
        alert("Polígono não encontrado.");
        return;
    }
    
    if (!nome) {
        nome = prompt("Digite o nome para o polígono:", polygon.name);
        if (!nome) return;
    }
    
    polygon.name = nome;
    
    const existingLabelIndex = polygonLabels.findIndex(label => label.polygonId === polygonId);
    if (existingLabelIndex !== -1) {
        mapa.removeLayer(polygonLabels[existingLabelIndex].layer);
        polygonLabels.splice(existingLabelIndex, 1);
    }
    
    const center = polygon.layer.getBounds().getCenter();
    
    const label = criarRotuloCustomizado(center, nome, polygonId, polygon.type === 'imported');
    
    polygonLabels.push({
        polygonId: polygonId,
        layer: label,
        isKml: polygon.type === 'imported'
    });
    
    // Se o polígono estiver oculto, ocultar o rótulo também
    if (!polygon.visible) {
        mapa.removeLayer(label);
    }
    
    // Aplicar transparência inicial (todos os rótulos começam ocultos)
    label.getElement().classList.add('transparent');
    
    polygon.layer.bindPopup(`
        <b>${nome}</b><br>
        <em>Use o botão "Ativar Movimento" para arrastar</em><br>
        <button onclick="adicionarRotuloParaPoligono('${polygonId}')">Adicionar/Editar Rótulo</button>
        
    `);
    
    atualizarListaPoligonos();
    atualizarControlesPoligonos();
    alert('Rótulo "' + nome + '" adicionado ao polígono com sucesso! O rótulo ficará visível apenas quando o polígono for selecionado.');
}

// Função para remover rótulo
function removerRotulo(polygonId) {
    const labelsParaRemover = polygonLabels.filter(label => label.polygonId === polygonId);
    labelsParaRemover.forEach(labelData => {
        mapa.removeLayer(labelData.layer);
    });
    
    polygonLabels = polygonLabels.filter(label => label.polygonId !== polygonId);
    alert('Rótulos removidos com sucesso!');
}

// Função para remover polígono (mantida para compatibilidade)
function removerPoligono(polygonId) {
    removerPoligonoIndividual(polygonId);
}

// Função para alternar visibilidade da camada e todos os seus elementos
function toggleCamada(layerId) {
    const layerIndex = kmlLayers.findIndex(l => l.id === layerId);
    if (layerIndex !== -1) {
        const layerData = kmlLayers[layerIndex];
        const button = document.querySelector(`#layer-control-${layerId} .layer-toggle`);
        
        if (layerData.visible) {
            // Ocultar camada completa
            mapa.removeLayer(layerData.layer);
            button.textContent = 'Oculta';
            button.classList.add('hidden');
            layerData.visible = false;
            
            // Ocultar todos os polígonos e rótulos desta camada
            polygons.forEach(polygon => {
                if (polygon.type === 'imported' && polygon.layer._kmlLayerId === layerId) {
                    polygon.visible = false;
                    mapa.removeLayer(polygon.layer);
                    
                    // Ocultar todos os rótulos associados
                    const labelsAssociados = polygonLabels.filter(label => label.polygonId === polygon.id);
                    labelsAssociados.forEach(labelData => {
                        mapa.removeLayer(labelData.layer);
                    });
                }
            });
        } else {
            // Mostrar camada completa
            mapa.addLayer(layerData.layer);
            button.textContent = 'Visível';
            button.classList.remove('hidden');
            layerData.visible = true;
            
            // Mostrar todos os polígonos e rótulos desta camada
            polygons.forEach(polygon => {
                if (polygon.type === 'imported' && polygon.layer._kmlLayerId === layerId) {
                    polygon.visible = true;
                    mapa.addLayer(polygon.layer);
                    
                    // Mostrar todos os rótulos associados
                    const labelsAssociados = polygonLabels.filter(label => label.polygonId === polygon.id);
                    labelsAssociados.forEach(labelData => {
                        mapa.addLayer(labelData.layer);
                    });
                    
                    // Aplicar estilo correto baseado na seleção
                    if (selectedPolygonIds.includes(polygon.id)) {
                        polygon.layer.setStyle({
                            fillColor: 'black',
                            fillOpacity: 0.25,
                            color: 'transparent',
                            weight: 0
                        });
                    } else {
                        // Se não for selecionado, manter transparente
                        polygon.layer.setStyle({
                            fillColor: 'transparent',
                            fillOpacity: 0,
                            color: 'transparent',
                            weight: 0
                        });
                    }
                }
            });
        }
        
        atualizarControlesPoligonos();
        atualizarTransparenciaRotulos();
    }
}

// Função para remover camada
function removerCamada(layerId) {
    const layerIndex = kmlLayers.findIndex(l => l.id === layerId);
    if (layerIndex !== -1) {
        const layerData = kmlLayers[layerIndex];
        
        // Remover do mapa
        mapa.removeLayer(layerData.layer);
        
        // Remover polígonos associados a esta camada
        const polygonsToRemove = polygons.filter(p => 
            p.type === 'imported' && p.layer._kmlLayerId === layerId
        );
        
        polygonsToRemove.forEach(polygon => {
            // Remover todos os rótulos associados
            const labelsParaRemover = polygonLabels.filter(label => label.polygonId === polygon.id);
            labelsParaRemover.forEach(labelData => {
                mapa.removeLayer(labelData.layer);
            });
            
            // Remover da lista de rótulos
            polygonLabels = polygonLabels.filter(label => label.polygonId !== polygon.id);
            
            // Remover da lista de polígonos
            polygons = polygons.filter(p => p.id !== polygon.id);
            
            // Remover da seleção se estiver selecionado
            selectedPolygonIds = selectedPolygonIds.filter(id => id !== polygon.id);
        });
        
        // Remover do array de camadas KML
        kmlLayers.splice(layerIndex, 1);
        
        // Remover controle da interface
        const controlDiv = document.getElementById(`layer-control-${layerId}`);
        if (controlDiv) {
            controlDiv.remove();
        }
        
        atualizarListaPoligonos();
        atualizarControlesPoligonos();
        atualizarTransparenciaRotulos();
        alert(`Camada "${layerData.name}" removida com sucesso!`);
    }
}

// Função para importar KML
function importarKML() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kml';
    input.onchange = (e) => {
        const arquivo = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            const nomeArquivo = arquivo.name.replace('.kml', '');
            const kml = omnivore.kml.parse(event.target.result);
            
            const layerId = 'kml_' + Date.now();
            
            // Adicionar ID à camada para referência
            kml._kmlLayerId = layerId;

            kml.eachLayer((layer) => {
                let nomeElemento = 'Polígono KML';
                let coordenadas;

                // Obter nome do elemento KML
                if (layer.feature && layer.feature.properties && layer.feature.properties.name) {
                    nomeElemento = layer.feature.properties.name;
                }

                // Obter coordenadas para o rótulo
                if (layer.getLatLng) {
                    coordenadas = layer.getLatLng();
                } else if (layer.getBounds) {
                    coordenadas = layer.getBounds().getCenter();
                }

                // Adicionar polígonos do KML à lista para movimento
                if (layer instanceof L.Polygon) {
                    const polygonId = layerId + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    
                    // Aplicar estilo TOTALMENTE TRANSPARENTE aos polígonos importados
                    layer.setStyle({
                        fillColor: 'transparent',
                        fillOpacity: 0,
                        color: 'transparent',
                        weight: 0
                    });
                    
                    layer.polygonId = polygonId;
                    layer._kmlLayerId = layerId; // Associar ao ID da camada
                    
                    const polygonData = {
                        id: polygonId,
                        layer: layer,
                        name: nomeElemento,
                        type: 'imported',
                        visible: true // Polígonos KML começam visíveis mas transparentes
                    };
                    
                    polygons.push(polygonData);
                    drawnItems.addLayer(layer);
                    
                    // Configurar evento de clique para seleção
                    configurarCliquePoligono(layer);
                    
                    importedKmlLayers.push({
                        polygonId: polygonId,
                        layer: layer,
                        name: nomeElemento
                    });

                    // Criar rótulo arrastável para o polígono KML com TAMANHO FIXO (inicialmente oculto)
                    if (coordenadas) {
                        const label = criarRotuloCustomizado(coordenadas, nomeElemento, polygonId, true);
                        
                        polygonLabels.push({
                            polygonId: polygonId,
                            layer: label,
                            isKml: true
                        });
                    }

                    layer.bindPopup(`
                        <b>${nomeElemento}</b><br>
                        <em>Polígono KML Importado</em><br>
                        <button onclick="adicionarRotuloParaPoligono('${polygonId}')">Editar Rótulo</button>
                        
                    `);

                    // Configurar arraste se estiver ativado
                    if (isDraggingEnabled) {
                        configurarArrastePoligono(layer);
                    }
                }
            });

            // Adicionar ao mapa
            mapa.addLayer(kml);
            
            // Adicionar controle da camada
            adicionarControleCamada(layerId, nomeArquivo, kml);
            
            atualizarListaPoligonos();
            atualizarControlesPoligonos();
            alert('Arquivo KML importado com sucesso: ' + nomeArquivo + '\n\nOs polígonos KML foram importados transparentes e os rótulos ficarão visíveis apenas quando selecionados.');
        };
        reader.readAsText(arquivo);
    };
    input.click();
}

// Função para configurar arraste de polígono
function configurarArrastePoligono(layer) {
    layer.options.interactive = true;
    
    let isDragging = false;
    let startLatLng;

    layer.on('mousedown', function(e) {
        isDragging = true;
        startLatLng = e.latlng;
        mapa.dragging.disable();
    });

    layer.on('mousemove', function(e) {
        if (isDragging) {
            const deltaLat = e.latlng.lat - startLatLng.lat;
            const deltaLng = e.latlng.lng - startLatLng.lng;
            
            const newLatLngs = layer.getLatLngs()[0].map(latlng => {
                return L.latLng(latlng.lat + deltaLat, latlng.lng + deltaLng);
            });
            
            layer.setLatLngs([newLatLngs]);
            startLatLng = e.latlng;
            
            if (layer.polygonId) {
                atualizarRotuloPoligono(layer.polygonId);
            }
        }
    });

    layer.on('mouseup', function() {
        isDragging = false;
        mapa.dragging.enable();
    });

    layer.getElement().style.cursor = 'move';
}

// Função para centralizar rótulo no polígono
function centralizarRotulo(polygonId) {
    const labelsAssociados = polygonLabels.filter(label => label.polygonId === polygonId);
    if (labelsAssociados.length > 0) {
        const polygon = polygons.find(p => p.id === polygonId);
        if (polygon) {
            const center = polygon.layer.getBounds().getCenter();
            labelsAssociados.forEach(labelData => {
                labelData.layer.setLatLng(center);
            });
        }
    }
}

// Função para ativar/desativar arraste para todos os polígonos
function toggleArrastePoligonos() {
    const botao = document.getElementById('btnToggleArraste');
    isDraggingEnabled = !isDraggingEnabled;
    
    if (isDraggingEnabled) {
        polygons.forEach(polygon => {
            if (polygon.visible) {
                configurarArrastePoligono(polygon.layer);
            }
        });
        botao.innerHTML = '<i class="fas fa-times"></i> <span class="btn-text">Desativar Movimento de Polígonos</span>';
        botao.setAttribute('data-arrastando', 'true');
        alert('Movimento dos polígonos ativado. Clique e arraste os polígonos para mover.');
    } else {
        polygons.forEach(polygon => {
            polygon.layer.off('mousedown');
            polygon.layer.off('mousemove');
            polygon.layer.off('mouseup');
            polygon.layer.getElement().style.cursor = '';
        });
        botao.innerHTML = '<i class="fas fa-arrows-alt"></i> <span class="btn-text">Ativar Movimento de Polígonos</span>';
        botao.setAttribute('data-arrastando', 'false');
        alert('Movimento dos polígonos desativado.');
    }
}

// Função para ativar/desativar arraste para rótulos
function toggleArrasteRotulos() {
    const botao = document.getElementById('btnToggleRotulo');
    isLabelDraggingEnabled = !isLabelDraggingEnabled;
    
    if (isLabelDraggingEnabled) {
        // Ativar dragging para todos os rótulos visíveis
        polygonLabels.forEach(labelData => {
            const polygon = polygons.find(p => p.id === labelData.polygonId);
            if (polygon && polygon.visible) {
                labelData.layer.dragging.enable();
            }
        });
        botao.innerHTML = '<i class="fas fa-times"></i> <span class="btn-text">Desativar Movimento de Rótulos</span>';
        botao.setAttribute('data-arrastando', 'true');
        alert('Movimento dos rótulos ativado. Agora você pode arrastar todos os rótulos visíveis livremente!');
    } else {
        // Desativar dragging para todos os rótulos
        polygonLabels.forEach(labelData => {
            labelData.layer.dragging.disable();
        });
        botao.innerHTML = '<i class="fas fa-text-width"></i> <span class="btn-text">Ativar Movimento de Rótulos</span>';
        botao.setAttribute('data-arrastando', 'false');
        alert('Movimento dos rótulos desativado.');
    }
}

// Função para atualizar rótulo quando polígono é movido
function atualizarRotuloPoligono(polygonId) {
    const labelsAssociados = polygonLabels.filter(label => label.polygonId === polygonId);
    if (labelsAssociados.length > 0) {
        const polygon = polygons.find(p => p.id === polygonId);
        if (polygon) {
            const center = polygon.layer.getBounds().getCenter();
            labelsAssociados.forEach(labelData => {
                labelData.layer.setLatLng(center);
            });
        }
    }
}

// Função para alternar opções de impressão
function togglePrintOptions() {
    const printOptions = document.getElementById('printOptions');
    if (printOptions.style.display === 'block') {
        printOptions.style.display = 'none';
    } else {
        printOptions.style.display = 'block';
        document.getElementById('tituloImpressao').value = document.getElementById('map-title').value;
    }
}

// Função para preparar a impressão
function prepararImpressao() {
    const titulo = document.getElementById('tituloImpressao').value || document.getElementById('map-title').value;
    const orientacao = document.getElementById('orientacao').value;
    
    document.getElementById('map-title').value = titulo;
    document.body.setAttribute('data-print-date', new Date().toLocaleDateString('pt-BR'));
    
    const style = document.createElement('style');
    style.innerHTML = `
        @page {
            size: A4 ${orientacao};
            margin: 2mm;
        }
        
        @media print {
            .map-container {
                height: 100vh !important;
            }
            
            #map {
                height: 100% !important;
            }
        }
    `;
    document.head.appendChild(style);
    
    window.print();
    
    setTimeout(() => {
        document.head.removeChild(style);
    }, 100);
}

// Event listeners
document.getElementById('endereco').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        buscarEndereco();
    }
});

document.getElementById('map-title').addEventListener('input', function() {
    console.log('Título do mapa atualizado:', this.value);
});

// =============================================
// EXEMPLOS DE USO DAS NOVAS FUNÇÕES
// =============================================

// Exemplo 1: Carregar uma camada específica
// carregarCamadaPorURL('caminho/para/arquivo.kml', 'Minha Camada', true, '#ff0000');

// Exemplo 2: Carregar todas as camadas predefinidas ao iniciar
// window.addEventListener('load', function() {
//     setTimeout(() => {
//         carregarCamadasPredefinidas();
//     }, 1000);
// });

// Inicializar o mapa
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapa);

// Inicializar o contador de polígonos
atualizarContadorPoligonos();