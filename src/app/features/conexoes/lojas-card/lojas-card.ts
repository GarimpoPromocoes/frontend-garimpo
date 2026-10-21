import { Component, OnInit, computed, inject } from '@angular/core';
import { ConexoesService, Provedor } from '../../../core/services/conexoes.service';
import { LojasUiService } from '../../../core/services/lojas-ui.service';
import { VerificacaoService } from '../../../core/services/verificacao.service';
import { ConfirmacaoService } from '../../../core/services/confirmacao.service';
import { AvisosService } from '../../../core/services/avisos.service';

/** ok = funcionando; atencao = funcionava e caiu (precisa entrar de novo); off = nunca conectada. */
type EstadoLoja = 'ok' | 'atencao' | 'off';

interface Loja {
  provedor: Provedor;
  nome: string;
  logo: string;
  conectada: boolean;
  estado: EstadoLoja;
  /** Por que caiu (só em 'atencao'). */
  motivo: string;
  conferidaEm: string | null;
  comoConectar: string;
}

/** Loja que aparece na grade mas ainda não tem integração. */
interface LojaEmBreve {
  id: string;
  nome: string;
  logo: string;
}

@Component({
  selector: 'app-lojas-card',
  standalone: true,
  templateUrl: './lojas-card.html',
})
export class LojasCard implements OnInit {
  private conexoes = inject(ConexoesService);
  protected verificacao = inject(VerificacaoService);
  protected lojasUi = inject(LojasUiService);
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

  protected readonly lojas = computed<Loja[]>(() => {
    const conexao = (p: Provedor) => this.conexoes.statusDe(p);
    // Loja que já funcionou e caiu vira um aviso no sino: aqui ela aparece como "precisa entrar de novo".
    const avisoDe = (p: Provedor) => this.avisos.avisos().find((a) => a.origem === p);
    const completar = (l: Pick<Loja, 'provedor' | 'nome' | 'logo' | 'conectada' | 'comoConectar'>): Loja => {
      const aviso = avisoDe(l.provedor);
      return {
        ...l,
        estado: aviso ? 'atencao' : l.conectada ? 'ok' : 'off',
        motivo: aviso?.texto ?? '',
        conferidaEm: conexao(l.provedor)?.ultimaValidacao ?? null,
      };
    };

    const base: Pick<Loja, 'provedor' | 'nome' | 'logo' | 'conectada' | 'comoConectar'>[] = [
      {
        provedor: 'mercadolivre',
        nome: 'Mercado Livre',
        logo: 'lojas/mercadolivre.svg',
        // O ML só tem essa sessão de navegador — sem ela, nada funciona.
        conectada: this.verificacao.mercadoLivreConectado(),
        comoConectar: 'Entre com a sua conta de afiliado do Mercado Livre, aqui mesmo no painel.',
      },
      {
        provedor: 'amazon',
        nome: 'Amazon',
        logo: 'lojas/amazon.svg',
        // Na Amazon quem garante comissão é a tag de associado; o login só
        // acrescenta o link curto. A tag não "cai" — não precisa de checagem
        // ao vivo pra decidir esse badge.
        conectada: conexao('amazon')?.status === 'conectado',
        comoConectar: 'Informe a sua tag de associado (termina com -20) e, se quiser o link curto, entre na conta.',
      },
      {
        provedor: 'shopee',
        nome: 'Shopee',
        logo: 'lojas/shopee.svg',
        // Shopee e' 100% API: estar conectada = as chaves ainda serem aceitas.
        conectada: this.verificacao.shopeeConectado(),
        comoConectar: 'Informe as chaves (App ID e Secret) do painel de Afiliados da Shopee.',
      },
    ];
    return base.map(completar);
  });

  /** A frase do topo: quantas funcionam e qual resolver primeiro. */
  protected readonly resumo = computed(() => {
    const lojas = this.lojas();
    const ok = lojas.filter((l) => l.estado === 'ok').length;
    const caida = lojas.find((l) => l.estado === 'atencao') ?? null;
    if (caida) {
      return {
        tom: 'atencao',
        titulo: `${ok} de ${lojas.length} lojas funcionando`,
        texto: `${caida.nome} precisa que você entre de novo. As outras seguem normalmente.`,
        resolver: caida,
      };
    }
    if (!ok) {
      return {
        tom: 'atencao',
        titulo: 'Nenhuma loja conectada',
        texto: 'Conecte pelo menos uma loja para o robô gerar os seus links de afiliado.',
        resolver: null,
      };
    }
    return {
      tom: 'ok',
      titulo: ok === lojas.length ? 'Todas as lojas funcionando' : `${ok} de ${lojas.length} lojas funcionando`,
      texto: ok === lojas.length ? 'Os links das ofertas saem com a sua comissão.' : 'Quer mais ofertas? Conecte as outras lojas abaixo.',
      resolver: null,
    };
  });

  protected quando(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hoje = new Date();
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === hoje.toDateString()
      ? `hoje, às ${hora}`
      : `em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, às ${hora}`;
  }

  ngOnInit(): void {
    this.conexoes.carregar();
  }

  abrir(provedor: Provedor): void {
    this.lojasUi.abrir(provedor);
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
