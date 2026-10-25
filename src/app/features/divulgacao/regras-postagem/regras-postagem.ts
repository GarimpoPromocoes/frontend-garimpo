import { Component, DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../../core/services/config.service';
import { StatusService } from '../../../core/services/status.service';
import { HORARIO_PADRAO, dentroDoHorario, duracaoJanela, horaValida, passaDaMeiaNoite } from './horario';
import { REGRAS_MARCA, conferirMarca } from './marca-dagua';
import { COPY_MAX, COPY_PADRAO, EXEMPLO_COM_CUPOM, EXEMPLO_SEM_CUPOM, VARIAVEIS_COPY, aplicarModelo, formatarWhatsApp } from './copy';

/** Quantas mensagens de divulgação diferentes dá pra cadastrar (o robô alterna entre elas). */
const MAX_DIVULGACOES = 3;

type Janela = 'frequencia' | 'repeticao' | 'cupons' | 'divulgacao' | 'alerta' | 'horario' | 'copy' | 'marca';

interface Ritmo {
  id: string;
  nome: string;
  descricao: string;
  min: number;
  max: number;
}

/** Ritmos prontos: a maioria das pessoas só quer escolher um e seguir. */
const RITMOS: Ritmo[] = [
  { id: 'tranquilo', nome: 'Tranquilo', descricao: 'Poucas mensagens, grupo sem cansar', min: 45, max: 90 },
  { id: 'equilibrado', nome: 'Equilibrado', descricao: 'O ritmo recomendado para a maioria', min: 20, max: 60 },
  { id: 'intenso', nome: 'Intenso', descricao: 'Muitas ofertas, para grupos bem ativos', min: 10, max: 25 },
];

const OPCOES_COOLDOWN = [
  { horas: 12, rotulo: '12 horas' },
  { horas: 24, rotulo: '1 dia' },
  { horas: 48, rotulo: '2 dias' },
  { horas: 72, rotulo: '3 dias' },
  { horas: 168, rotulo: '1 semana' },
];

const OPCOES_REPOSTAR = [
  { dias: 0, rotulo: 'Nunca' },
  { dias: 7, rotulo: '7 dias' },
  { dias: 14, rotulo: '14 dias' },
  { dias: 30, rotulo: '30 dias' },
];

/** Prefixo dos códigos de cupom: mesma regra do backend (config.service.js / nomeCupom.js). */
const PREFIXO_PADRAO = 'GARIMPO';
const PREFIXO_MIN = 3;
const PREFIXO_MAX = 12;

/** Divisões prontas das mensagens: só cupom / produto com cupom (o resto é produto sem cupom). */
const DIVISOES = [
  { nome: 'Poucos cupons', soCupom: 5, produtoCupom: 10 },
  { nome: 'Equilibrado', soCupom: 10, produtoCupom: 25 },
  { nome: 'Muitos cupons', soCupom: 20, produtoCupom: 40 },
];

function limparPrefixo(p: string): string {
  return (p || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, PREFIXO_MAX);
}

function textoHoras(h: number): string {
  if (!h) return 'sem espera';
  if (h % 24 === 0) {
    const d = h / 24;
    return d === 1 ? '1 dia' : `${d} dias`;
  }
  return h === 1 ? '1 hora' : `${h} horas`;
}

function postsPorDia(min: number, max: number): string {
  if (!min || !max || min > max) return '—';
  const muitos = Math.round((24 * 60) / min);
  const poucos = Math.round((24 * 60) / max);
  return poucos === muitos ? `${poucos}` : `${poucos} a ${muitos}`;
}

/** Teto diário do garimpo por grupo = máximo de postagens/dia (mesma conta do backend: cotaDiaria.js). */
function garimpoMaxPorDia(min: number, max: number): number | null {
  const menor = Math.min(...[min, max].filter((v) => v > 0));
  return Number.isFinite(menor) ? Math.max(1, Math.round((24 * 60) / menor)) : null;
}

/** Destino do aviso de queda: só dígitos é número, o resto é nome de grupo (mesma regra do backend: alertaConexao.js). */
function ehNumero(texto: string): boolean {
  if (!/^\+?[\d\s().-]+$/.test(texto)) return false;
  const digitos = texto.replace(/\D/g, '').length;
  return digitos >= 10 && digitos <= 15;
}

/**
 * Regras de postagem em cards, igual às telas de Grupos e Lojas: cada card
 * mostra o que está valendo agora e o clique abre a janela para ajustar.
 * Salvar na janela já grava. Cupons moraram numa aba própria; aqui fazem
 * mais sentido — são mais uma regra de "o que vai para o grupo e com que
 * frequência".
 */
@Component({
  selector: 'app-regras-postagem',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './regras-postagem.html',
  styleUrl: './regras-postagem.scss',
})
export class RegrasPostagem {
  protected configService = inject(ConfigService);
  protected statusService = inject(StatusService);

  protected readonly ritmos = RITMOS;
  protected readonly opcoesCooldown = OPCOES_COOLDOWN;
  protected readonly opcoesRepostar = OPCOES_REPOSTAR;
  protected readonly divisoes = DIVISOES;
  protected readonly prefixoPadrao = PREFIXO_PADRAO;
  protected readonly prefixoMax = PREFIXO_MAX;
  protected readonly textoHoras = textoHoras;
  protected readonly ehNumero = ehNumero;
  protected readonly n = (v: unknown): number => Number(v) || 0;

  // ---- o que está salvo (cards) ---------------------------------------------

  private readonly cfg = computed(() => this.configService.config());

  protected readonly frequencia = computed(() => {
    const a = this.cfg()?.agendamento;
    const min = a?.intervaloMinMinutos ?? 20;
    const max = a?.intervaloMaxMinutos ?? 60;
    const ritmo = RITMOS.find((r) => r.min === min && r.max === max);
    return {
      min,
      max,
      porDia: postsPorDia(min, max),
      garimpoMax: garimpoMaxPorDia(min, max),
      ritmo: ritmo?.nome ?? 'Personalizado',
    };
  });

  protected readonly repeticao = computed(() => {
    const p = this.cfg()?.postagem;
    return { cooldownHoras: p?.cooldownHoras ?? 48, repostarAposDias: p?.repostarAposDias ?? 14 };
  });

  protected readonly cupons = computed(() => {
    const c = this.cfg()?.cupons;
    const prefixo = limparPrefixo(c?.prefixo ?? '') || PREFIXO_PADRAO;
    const ativo = c?.ativo ?? true;
    const soCupom = ativo ? (c?.percentualSozinho ?? 10) : 0;
    const produtoCupom = ativo ? (c?.percentualProduto ?? 15) : 0;
    return { ativo, prefixo, exemplo: `${prefixo}10OFF`, soCupom, produtoCupom, produto: 100 - soCupom - produtoCupom };
  });

  protected readonly cuponsDisponiveis = computed(() => this.statusService.status()?.cuponsAtivos ?? null);

  protected readonly divulgacao = computed(() => {
    const d = this.cfg()?.divulgacao;
    return {
      ativo: d?.ativo ?? false,
      texto: d?.texto ?? '',
      textos: d?.textos?.length ? d.textos : d?.texto ? [d.texto] : [],
      imagens: d?.imagens ?? [],
      link: d?.link ?? '',
      maxPorDia: d?.maxPorDia ?? 1,
    };
  });

  protected readonly alerta = computed(() => {
    const a = this.cfg()?.alertaConexao;
    return { ativo: a?.ativo ?? false, grupo: a?.grupo ?? '' };
  });

  /** Relógio do status do horário: avança sozinho para o card virar na hora de ligar/desligar. */
  private readonly agora = signal(new Date());

  constructor() {
    const t = setInterval(() => this.agora.set(new Date()), 30000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(t);
      this.trocarUrl(this.marcaUrl, null);
      this.trocarUrl(this.rMarcaPrevia, null);
      for (const url of Object.values(this.divImagemUrls())) URL.revokeObjectURL(url);
    });
    void this.carregarMarca();
  }

  // ---- marca d'água ---------------------------------------------------------

  protected readonly regrasMarca = REGRAS_MARCA;
  /** A marca salva (endereço local da imagem), ou null sem nenhuma. */
  protected readonly marcaUrl = signal<string | null>(null);
  /** Imagem escolhida na janela, ainda não salva. */
  protected readonly rMarcaArquivo = signal<File | null>(null);
  protected readonly rMarcaPrevia = signal<string | null>(null);
  protected readonly rMarcaRemover = signal(false);
  protected readonly rMarcaConferindo = signal(false);
  /** O que a janela mostra: a escolhida agora, a salva, ou nada (remover marcado). */
  protected readonly rMarcaMostrar = computed(() => this.rMarcaPrevia() ?? (this.rMarcaRemover() ? null : this.marcaUrl()));

  private trocarUrl(alvo: WritableSignal<string | null>, url: string | null): void {
    const antiga = alvo();
    if (antiga) URL.revokeObjectURL(antiga);
    alvo.set(url);
  }

  private async carregarMarca(): Promise<void> {
    const blob = await this.configService.marcaDagua();
    this.trocarUrl(this.marcaUrl, blob ? URL.createObjectURL(blob) : null);
  }

  async escolherMarca(campo: HTMLInputElement): Promise<void> {
    const arquivo = campo.files?.[0];
    campo.value = '';
    if (!arquivo) return;
    this.erro.set(null);
    this.rMarcaConferindo.set(true);
    const r = await conferirMarca(arquivo);
    this.rMarcaConferindo.set(false);
    if (r.erro) {
      this.erro.set(r.erro);
      return;
    }
    this.rMarcaArquivo.set(arquivo);
    this.rMarcaRemover.set(false);
    this.trocarUrl(this.rMarcaPrevia, URL.createObjectURL(arquivo));
  }

  removerMarca(): void {
    this.erro.set(null);
    this.rMarcaArquivo.set(null);
    this.trocarUrl(this.rMarcaPrevia, null);
    this.rMarcaRemover.set(true);
  }

  protected readonly horario = computed(() => {
    const h = this.cfg()?.horario ?? HORARIO_PADRAO;
    const dentro = dentroDoHorario(h, this.agora());
    const roboLigado = !!this.statusService.status()?.agendamento?.manual?.ativo;
    let situacao: string;
    if (!h.ativo) situacao = 'Posta a qualquer hora do dia';
    else if (dentro) situacao = `No horário — posta até as ${h.fim}`;
    else if (roboLigado) situacao = `Fora do horário — garimpando, posta de novo às ${h.inicio}`;
    else situacao = `Fora do horário — posta de novo às ${h.inicio}`;
    return { ...h, dentro, situacao, duracao: duracaoJanela(h.inicio, h.fim), virada: passaDaMeiaNoite(h.inicio, h.fim) };
  });

  protected readonly copy = computed(() => {
    const modelo = this.cfg()?.copy?.modelo ?? '';
    const personalizado = !!modelo.trim() && modelo !== COPY_PADRAO;
    const previa = aplicarModelo(personalizado ? modelo : COPY_PADRAO, EXEMPLO_SEM_CUPOM);
    return { personalizado, previa: formatarWhatsApp(previa) };
  });

  // ---- janela de edição -------------------------------------------------------

  protected readonly janela = signal<Janela | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  // rascunhos
  protected readonly rMin = signal(20);
  protected readonly rMax = signal(60);
  protected readonly rCooldown = signal(48);
  protected readonly rRepostar = signal(14);
  protected readonly rCupomAtivo = signal(true);
  protected readonly rCupomPrefixo = signal('');
  /** As duas alças do slider: fim do "só cupom" e fim do "produto com cupom" (0–100). */
  protected readonly rCorte1 = signal(10);
  protected readonly rCorte2 = signal(25);
  protected readonly rSoCupom = computed(() => Number(this.rCorte1()));
  protected readonly rProdutoCupom = computed(() => Number(this.rCorte2()) - Number(this.rCorte1()));
  protected readonly rProdutoSem = computed(() => 100 - Number(this.rCorte2()));
  protected readonly rDivAtivo = signal(false);
  /** Até MAX_DIVULGACOES mensagens; o robô alterna entre elas. */
  protected readonly rDivTextos = signal<string[]>(['']);
  /** Imagem de cada mensagem (id do upload), na mesma posição do texto. '' = sem imagem. */
  protected readonly rDivImagens = signal<string[]>(['']);
  /** Qual mensagem está com a imagem subindo agora (-1 = nenhuma). */
  protected readonly rDivSubindo = signal(-1);
  /** Endereço local de cada imagem já vista (por id), pra mostrar na janela. */
  protected readonly divImagemUrls = signal<Record<string, string>>({});
  protected readonly maxDivulgacoes = MAX_DIVULGACOES;
  protected readonly rDivLink = signal('');
  protected readonly rDivMax = signal(1);
  protected readonly rAlertaAtivo = signal(false);
  protected readonly rAlertaGrupo = signal('');
  protected readonly rHorAtivo = signal(false);
  protected readonly rHorInicio = signal(HORARIO_PADRAO.inicio);
  protected readonly rHorFim = signal(HORARIO_PADRAO.fim);
  protected readonly rHorDuracao = computed(() => duracaoJanela(this.rHorInicio(), this.rHorFim()));
  protected readonly rHorVirada = computed(() => passaDaMeiaNoite(this.rHorInicio(), this.rHorFim()));
  protected readonly variaveisCopy = VARIAVEIS_COPY;
  protected readonly copyMax = COPY_MAX;
  protected readonly rCopy = signal(COPY_PADRAO);
  /** A prévia mostra o produto de exemplo com ou sem cupom. */
  protected readonly rCopyComCupom = signal(true);
  protected readonly rCopyPadrao = computed(() => this.rCopy() === COPY_PADRAO);
  protected readonly rCopySemLink = computed(() => !!this.rCopy().trim() && !this.rCopy().includes('{link}'));
  protected readonly rCopyPrevia = computed(() =>
    formatarWhatsApp(aplicarModelo(this.rCopy().trim() ? this.rCopy() : COPY_PADRAO, this.rCopyComCupom() ? EXEMPLO_COM_CUPOM : EXEMPLO_SEM_CUPOM)),
  );

  /** As mensagens que valem: com texto ou só com imagem (em branco não é salva). */
  private divMensagens(): { texto: string; imagem: string }[] {
    const imagens = this.rDivImagens();
    return this.rDivTextos()
      .map((t, i) => ({ texto: (t || '').trim(), imagem: imagens[i] || '' }))
      .filter((m) => m.texto || m.imagem);
  }

  /** Previa de como cada mensagem sai no grupo (mesma regra do backend), com a imagem em cima. */
  protected readonly rDivPreviews = computed(() => {
    const l = (this.rDivLink() || '').trim();
    const urls = this.divImagemUrls();
    // Só o link sozinho quando nenhuma mensagem foi escrita.
    const mensagens = this.divMensagens();
    return (mensagens.length ? mensagens : [{ texto: '', imagem: '' }])
      .map(({ texto: t, imagem }) => {
        let texto = t;
        if (l) {
          if (t.includes('{link}')) texto = t.split('{link}').join(l);
          else if (t.includes('[LINK DOS GRUPOS]')) texto = t.split('[LINK DOS GRUPOS]').join(l);
          else texto = t ? `${t}\n\n🔗 ${l}` : l;
        }
        return { texto, imagem: imagem ? (urls[imagem] ?? null) : null };
      })
      .filter((p) => p.texto || p.imagem);
  });

  protected mudarDivTexto(i: number, texto: string): void {
    this.rDivTextos.update((lista) => lista.map((t, k) => (k === i ? texto : t)));
  }

  protected adicionarDivTexto(): void {
    if (this.rDivTextos().length >= MAX_DIVULGACOES) return;
    this.rDivTextos.update((lista) => [...lista, '']);
    this.rDivImagens.update((lista) => [...lista, '']);
  }

  protected removerDivTexto(i: number): void {
    if (this.rDivTextos().length <= 1) return;
    this.rDivTextos.update((lista) => lista.filter((_, k) => k !== i));
    this.rDivImagens.update((lista) => lista.filter((_, k) => k !== i));
  }

  /** Imagem escolhida pra mensagem i: sobe na hora e guarda o id (vale ao salvar a janela). */
  async escolherDivImagem(i: number, campo: HTMLInputElement): Promise<void> {
    const arquivo = campo.files?.[0];
    campo.value = '';
    if (!arquivo) return;
    this.erro.set(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type)) {
      this.erro.set('A imagem precisa ser PNG, JPG ou WebP.');
      return;
    }
    if (arquivo.size > 5 * 1024 * 1024) {
      this.erro.set('A imagem pode ter no máximo 5 MB.');
      return;
    }
    this.rDivSubindo.set(i);
    const r = await this.configService.subirDivulgacaoImagem(arquivo);
    this.rDivSubindo.set(-1);
    if (!r.id) {
      this.erro.set(r.erro ?? 'Não consegui enviar a imagem.');
      return;
    }
    const id = r.id;
    if (!this.divImagemUrls()[id]) this.divImagemUrls.update((m) => ({ ...m, [id]: URL.createObjectURL(arquivo) }));
    this.rDivImagens.update((lista) => lista.map((v, k) => (k === i ? id : v)));
  }

  removerDivImagem(i: number): void {
    this.rDivImagens.update((lista) => lista.map((v, k) => (k === i ? '' : v)));
  }

  /** Busca as imagens salvas que a janela ainda não mostrou. */
  private async carregarDivImagens(ids: string[]): Promise<void> {
    for (const id of ids) {
      if (!id || this.divImagemUrls()[id]) continue;
      const blob = await this.configService.divulgacaoImagem(id);
      if (blob) this.divImagemUrls.update((m) => ({ ...m, [id]: URL.createObjectURL(blob) }));
    }
  }

  protected readonly rPorDia = computed(() => postsPorDia(Number(this.rMin()), Number(this.rMax())));
  protected readonly rGarimpoMax = computed(() => garimpoMaxPorDia(Number(this.rMin()), Number(this.rMax())));
  protected readonly rRitmo = computed(
    () => RITMOS.find((r) => r.min === Number(this.rMin()) && r.max === Number(this.rMax()))?.id ?? 'personalizado',
  );
  /** Como os códigos vão sair com o prefixo digitado (mesma ordem de tentativa do robô). */
  protected readonly rCupomExemplos = computed(() => {
    const p = limparPrefixo(this.rCupomPrefixo()) || PREFIXO_PADRAO;
    return [`${p}10OFF`, `${p}OFF10`, `${p}20REAIS`, `${p}FRETE`];
  });
  /** O tempo mínimo vence a "repetição liberada": avisa quando um anula o outro. */
  protected readonly rConflitoRepeticao = computed(() => {
    const d = Number(this.rRepostar());
    return d > 0 && d * 24 < Number(this.rCooldown());
  });

  abrir(j: Janela): void {
    this.erro.set(null);
    const f = this.frequencia();
    const r = this.repeticao();
    const c = this.cfg()?.cupons;
    this.rMin.set(f.min);
    this.rMax.set(f.max);
    this.rCooldown.set(r.cooldownHoras);
    this.rRepostar.set(r.repostarAposDias);
    this.rCupomAtivo.set(c?.ativo ?? true);
    this.rCupomPrefixo.set(c?.prefixo ?? '');
    const soCupom = c?.percentualSozinho ?? 10;
    this.rCorte1.set(soCupom);
    this.rCorte2.set(Math.min(100, soCupom + (c?.percentualProduto ?? 15)));
    const d = this.divulgacao();
    this.rDivAtivo.set(d.ativo);
    this.rDivTextos.set(d.textos.length ? [...d.textos] : ['']);
    this.rDivImagens.set(this.rDivTextos().map((_, i) => d.imagens[i] || ''));
    void this.carregarDivImagens(this.rDivImagens());
    this.rDivLink.set(d.link);
    this.rDivMax.set(d.maxPorDia === 2 ? 2 : 1);
    const al = this.alerta();
    this.rAlertaAtivo.set(al.ativo);
    this.rAlertaGrupo.set(al.grupo);
    const h = this.horario();
    this.rHorAtivo.set(h.ativo);
    this.rHorInicio.set(h.inicio);
    this.rHorFim.set(h.fim);
    const modelo = this.cfg()?.copy?.modelo ?? '';
    this.rCopy.set(modelo.trim() ? modelo : COPY_PADRAO);
    this.rCopyComCupom.set(true);
    this.rMarcaArquivo.set(null);
    this.trocarUrl(this.rMarcaPrevia, null);
    this.rMarcaRemover.set(false);
    this.janela.set(j);
  }

  fechar(): void {
    if (this.salvando()) return;
    this.janela.set(null);
    this.erro.set(null);
  }

  /** As alças não se cruzam: a primeira nunca passa da segunda. */
  mudarCorte1(v: number): void {
    this.rCorte1.set(Math.max(0, Math.min(Number(v) || 0, Number(this.rCorte2()))));
  }

  mudarCorte2(v: number): void {
    this.rCorte2.set(Math.min(100, Math.max(Number(v) || 0, Number(this.rCorte1()))));
  }

  escolherDivisao(d: { soCupom: number; produtoCupom: number }): void {
    this.rCorte1.set(d.soCupom);
    this.rCorte2.set(d.soCupom + d.produtoCupom);
  }

  divisaoAtiva(d: { soCupom: number; produtoCupom: number }): boolean {
    return this.rSoCupom() === d.soCupom && this.rProdutoCupom() === d.produtoCupom;
  }

  /** O campo já mostra o prefixo do jeito que vai sair: maiúsculo, sem espaço, acento ou símbolo. */
  mudarPrefixo(v: string): void {
    this.rCupomPrefixo.set(limparPrefixo(v));
  }

  /** Coloca a variável onde está o cursor do campo (ou no fim). */
  inserirVariavel(nome: string, campo: HTMLTextAreaElement): void {
    const atual = this.rCopy();
    const ini = campo.selectionStart ?? atual.length;
    const fim = campo.selectionEnd ?? atual.length;
    const trecho = `{${nome}}`;
    this.rCopy.set(atual.slice(0, ini) + trecho + atual.slice(fim));
    const pos = ini + trecho.length;
    setTimeout(() => {
      campo.focus();
      campo.setSelectionRange(pos, pos);
    });
  }

  voltarCopyPadrao(): void {
    this.rCopy.set(COPY_PADRAO);
  }

  escolherRitmo(r: Ritmo): void {
    this.rMin.set(r.min);
    this.rMax.set(r.max);
  }

  async salvar(): Promise<void> {
    const j = this.janela();
    if (!j) return;
    this.erro.set(null);

    if (j === 'marca') {
      await this.salvarMarca();
      return;
    }

    let partial: Record<string, unknown>;
    if (j === 'frequencia') {
      const min = Number(this.rMin());
      const max = Number(this.rMax());
      if (!(min >= 1 && max >= 1 && min <= 720 && max <= 720)) {
        this.erro.set('Use valores entre 1 e 720 minutos.');
        return;
      }
      if (min > max) {
        this.erro.set('O tempo mínimo não pode ser maior que o máximo.');
        return;
      }
      partial = { agendamento: { intervaloMinMinutos: min, intervaloMaxMinutos: max } };
    } else if (j === 'repeticao') {
      const cooldown = Number(this.rCooldown());
      const repostar = Number(this.rRepostar());
      if (!(cooldown >= 0 && cooldown <= 720)) {
        this.erro.set('O tempo mínimo vai de 0 a 720 horas (30 dias).');
        return;
      }
      if (!(repostar >= 0 && repostar <= 90)) {
        this.erro.set('A repetição liberada vai de 0 a 90 dias.');
        return;
      }
      partial = { postagem: { cooldownHoras: cooldown, repostarAposDias: repostar } };
    } else if (j === 'divulgacao') {
      if (this.rDivSubindo() >= 0) {
        this.erro.set('Espere a imagem terminar de subir.');
        return;
      }
      // Mensagem sem texto e sem imagem não conta: some da lista ao salvar.
      const mensagens = this.divMensagens().slice(0, MAX_DIVULGACOES);
      const textos = mensagens.map((m) => m.texto);
      const imagens = mensagens.map((m) => m.imagem);
      const link = (this.rDivLink() || '').trim();
      const max = Number(this.rDivMax()) === 2 ? 2 : 1;
      if (this.rDivAtivo() && !mensagens.length && !link) {
        this.erro.set('Escreva a mensagem ou informe o link antes de ativar a divulgação.');
        return;
      }
      partial = {
        divulgacao: { ativo: this.rDivAtivo(), texto: textos.find(Boolean) ?? '', textos, imagens, link, maxPorDia: max },
      };
    } else if (j === 'horario') {
      const inicio = (this.rHorInicio() || '').trim();
      const fim = (this.rHorFim() || '').trim();
      if (!horaValida(inicio) || !horaValida(fim)) {
        this.erro.set('Informe a hora de ligar e a de desligar (ex.: 07:00 e 21:00).');
        return;
      }
      if (this.rHorAtivo() && inicio === fim) {
        this.erro.set('A hora de ligar e a de desligar não podem ser iguais.');
        return;
      }
      partial = { horario: { ativo: this.rHorAtivo(), inicio, fim } };
    } else if (j === 'copy') {
      const modelo = this.rCopy();
      if (modelo.length > COPY_MAX) {
        this.erro.set(`O texto pode ter no máximo ${COPY_MAX} caracteres.`);
        return;
      }
      if (modelo.trim() && !modelo.includes('{link}')) {
        this.erro.set('Coloque {link} no texto — sem ele a pessoa não chega na oferta.');
        return;
      }
      // Igual ao padrão (ou vazio) grava vazio: a conta segue o texto padrão do robô.
      partial = { copy: { modelo: modelo === COPY_PADRAO || !modelo.trim() ? '' : modelo } };
    } else if (j === 'alerta') {
      partial = { alertaConexao: { ativo: this.rAlertaAtivo(), grupo: (this.rAlertaGrupo() || '').trim() } };
    } else {
      const prefixo = limparPrefixo(this.rCupomPrefixo());
      if (prefixo && prefixo.length < PREFIXO_MIN) {
        this.erro.set(`O prefixo precisa de pelo menos ${PREFIXO_MIN} letras ou números (ou deixe em branco para usar ${PREFIXO_PADRAO}).`);
        return;
      }
      partial = {
        cupons: {
          ativo: this.rCupomAtivo(),
          prefixo,
          percentualSozinho: this.rSoCupom(),
          percentualProduto: this.rProdutoCupom(),
        },
      };
    }

    this.salvando.set(true);
    const r = await this.configService.salvar(partial);
    this.salvando.set(false);
    if (!r.ok) {
      this.erro.set(r.erro ?? 'Erro ao salvar.');
      return;
    }
    this.janela.set(null);
  }

  private async salvarMarca(): Promise<void> {
    const arquivo = this.rMarcaArquivo();
    if (!arquivo && !this.rMarcaRemover()) {
      this.janela.set(null);
      return;
    }
    this.salvando.set(true);
    const r = arquivo ? await this.configService.salvarMarcaDagua(arquivo) : await this.configService.removerMarcaDagua();
    if (r.ok) await this.carregarMarca();
    this.salvando.set(false);
    if (!r.ok) {
      this.erro.set(r.erro ?? 'Erro ao salvar.');
      return;
    }
    this.janela.set(null);
  }
}
