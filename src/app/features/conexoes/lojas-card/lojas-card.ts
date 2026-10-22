import { Component, OnInit, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ConexoesService, Provedor } from '../../../core/services/conexoes.service';
import { LojasUiService } from '../../../core/services/lojas-ui.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';
import { AvisosService } from '../../../core/services/avisos.service';
import { ProvedorConexao } from '../../../core/services/status.service';
import { WhatsappUiService } from '../../../core/services/whatsapp-ui.service';
import { TelegramUiService } from '../../../core/services/telegram-ui.service';

/** ok = funcionando; atencao = funcionava e caiu (precisa entrar de novo); off = nunca conectada. */
type EstadoConexao = 'ok' | 'atencao' | 'off';

/** Um cartão da tela: um canal de envio (WhatsApp, Telegram) ou uma loja de afiliado. */
interface Conta {
  provedor: ProvedorConexao;
  nome: string;
  logo: string;
  conectada: boolean;
  estado: EstadoConexao;
  /** Por que caiu (só em 'atencao'). */
  motivo: string;
}

/** Loja que aparece na grade mas ainda não tem integração. */
interface LojaEmBreve {
  id: string;
  nome: string;
  logo: string;
}

const CANAIS: ProvedorConexao[] = ['whatsapp', 'telegram'];

/**
 * Conexões: os canais por onde o robô envia (WhatsApp e Telegram) e as lojas que geram os links
 * com a sua comissão (Mercado Livre, Amazon e Shopee). Cada uma num cartão; a conexão em si
 * acontece na janela de cada uma (montadas no shell).
 */
@Component({
  selector: 'app-lojas-card',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './lojas-card.html',
})
export class LojasCard implements OnInit {
  private conexoes = inject(ConexoesService);
  protected verificacao = inject(VerificacaoService);
  protected lojasUi = inject(LojasUiService);
  private whatsappUi = inject(WhatsappUiService);
  private telegramUi = inject(TelegramUiService);
  private confirmacao = inject(ConfirmacaoService);
  private avisos = inject(AvisosService);

  // Ainda em desenvolvimento: ficam visíveis, mas o clique só avisa.
  // Quando uma ficar pronta, ela sai daqui e entra em `lojas` com o provedor.
  protected readonly emBreve: LojaEmBreve[] = [
    { id: 'shein', nome: 'Shein', logo: 'lojas/shein.png' },
    { id: 'nike', nome: 'Nike', logo: 'lojas/nike.png' },
    { id: 'netshoes', nome: 'Netshoes', logo: 'lojas/netshoes.png' },
    { id: 'adidas', nome: 'Adidas', logo: 'lojas/adidas.png' },
    { id: 'centauro', nome: 'Centauro', logo: 'lojas/centauro.png' },
  ];

  protected readonly erro = computed(() => this.conexoes.erro());

  /** Conta que já funcionou e caiu vira um aviso no sino: aqui ela aparece como "precisa entrar de novo". */
  private completar(c: Pick<Conta, 'provedor' | 'nome' | 'logo' | 'conectada'>): Conta {
    const aviso = this.avisos.avisos().find((a) => a.origem === c.provedor);
    return { ...c, estado: aviso ? 'atencao' : c.conectada ? 'ok' : 'off', motivo: aviso?.texto ?? '' };
  }

  protected readonly canais = computed<Conta[]>(() => [
    this.completar({
      provedor: 'whatsapp',
      nome: 'WhatsApp',
      logo: 'lojas/whatsapp.svg',
      conectada: this.verificacao.whatsappConectado(),
    }),
    this.completar({
      provedor: 'telegram',
      nome: 'Telegram',
      logo: 'lojas/telegram.png',
      conectada: this.verificacao.telegramConectado(),
    }),
  ]);

  protected readonly lojas = computed<Conta[]>(() => {
    const conexao = (p: Provedor) => this.conexoes.statusDe(p);
    return [
      this.completar({
        provedor: 'mercadolivre',
        nome: 'Mercado Livre',
        logo: 'lojas/mercadolivre.svg',
        // O ML só tem essa sessão de navegador — sem ela, nada funciona.
        conectada: this.verificacao.mercadoLivreConectado(),
      }),
      this.completar({
        provedor: 'amazon',
        nome: 'Amazon',
        logo: 'lojas/amazon.svg',
        // Na Amazon quem garante comissão é a tag de associado; o login só
        // acrescenta o link curto. A tag não "cai" — não precisa de checagem
        // ao vivo pra decidir esse badge.
        conectada: conexao('amazon')?.status === 'conectado',
      }),
      this.completar({
        provedor: 'shopee',
        nome: 'Shopee',
        logo: 'lojas/shopee.svg',
        // Shopee e' 100% API: estar conectada = as chaves ainda serem aceitas.
        conectada: this.verificacao.shopeeConectado(),
      }),
    ];
  });

  /** O aviso do topo, só quando tem algo a resolver. Tudo certo: nada (os cartões já mostram). */
  protected readonly resumo = computed(() => {
    const canais = this.canais();
    const lojas = this.lojas();
    const caida = [...canais, ...lojas].find((c) => c.estado === 'atencao') ?? null;
    if (caida) {
      return {
        titulo: `${caida.nome} desconectou`,
        texto: `${caida.nome} precisa que você entre de novo. As outras conexões seguem normalmente.`,
        resolver: caida,
      };
    }
    if (!canais.some((c) => c.estado === 'ok')) {
      return {
        titulo: 'Nenhum canal de envio conectado',
        texto: 'Conecte o WhatsApp ou o Telegram para o robô enviar as promoções.',
        resolver: null,
      };
    }
    if (!lojas.some((l) => l.estado === 'ok')) {
      return {
        titulo: 'Nenhuma loja conectada',
        texto: 'Conecte pelo menos uma loja para o robô gerar os seus links de afiliado.',
        resolver: null,
      };
    }
    return null;
  });

  protected ehCanal(c: Conta): boolean {
    return CANAIS.includes(c.provedor);
  }

  ngOnInit(): void {
    this.conexoes.carregar();
  }

  abrir(provedor: ProvedorConexao): void {
    if (provedor === 'whatsapp') this.whatsappUi.abrir();
    else if (provedor === 'telegram') this.telegramUi.abrir();
    else this.lojasUi.abrir(provedor);
  }

  avisarEmBreve(nome: string): void {
    void this.confirmacao.pedir({
      titulo: `${nome} ainda não está disponível`,
      texto: `A integração com a ${nome} está em desenvolvimento. Assim que ficar pronta, é só voltar aqui e conectar.`,
      confirmar: 'Entendi',
      soAviso: true,
    });
  }

  recarregar(): void {
    this.conexoes.carregar();
  }
}
