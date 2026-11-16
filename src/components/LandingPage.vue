<script setup>
import { Timer, ShoppingBag, LayoutDashboard, UserRound, Store, ArrowRight } from '@lucide/vue';
import { ADMIN_ENABLED } from '../services/config';
import { href } from '../router';

// Página de visitas: primeira tela de quem não está logado. Apresenta o
// DRP Commerce e leva ao login do cliente, ao cadastro ou ao painel do lojista.
const FEATURES = [
  {
    icon: Timer,
    tone: 'live',
    title: 'Drops',
    text: 'Lançamentos de estoque limitado. O cliente se inscreve, entra numa fila, acompanha a posição e, quando chega a vez dele, tem alguns minutos para comprar.',
  },
  {
    icon: ShoppingBag,
    tone: 'success',
    title: 'Vitrine',
    text: 'A loja do dia a dia, sem fila: catálogo por categoria, sacola e checkout.',
  },
  {
    icon: LayoutDashboard,
    tone: 'scheduled',
    title: 'Painel do lojista',
    text: 'Vendas do dia e do mês, drops, produtos, estoque, cupons, pedidos, clientes e equipe em um só lugar.',
  },
];

const DROP_STEPS = [
  { title: 'Inscrição', text: 'O cliente garante a vaga antes da abertura. Drops com inscrição prévia pedem CPF validado.' },
  { title: 'Fila', text: 'Na abertura, entra na fila prioritária e vê a posição atualizar sozinha.' },
  { title: 'Sua vez', text: 'Quando é chamado, a unidade fica reservada por alguns minutos.' },
  { title: 'Compra', text: 'Finaliza o pagamento dentro da janela. Se esgotar, entra na lista de espera.' },
];
</script>

<template>
  <div class="ds-stack--12">
    <section class="ds-grid ds-grid--split">
      <div class="ds-stack--5">
        <span class="ds-label-caps">DRP Commerce</span>
        <h1 class="ds-display">
          Lançamentos limitados e a loja do dia a dia, no mesmo lugar.
        </h1>
        <p class="ds-text-lg ds-text-secondary">
          Uma plataforma de e-commerce para lojas que vendem por drops, com fila justa e tempo para comprar,
          e que também têm uma vitrine sempre aberta.
        </p>
        <div class="ds-cluster ds-cluster--2">
          <a
            class="ds-btn ds-btn--primary ds-btn--lg"
            :href="href('/criar-conta')"
          >
            Criar conta
          </a>
          <a
            class="ds-btn ds-btn--secondary ds-btn--lg"
            :href="href('/entrar')"
          >
            Entrar
          </a>
        </div>
      </div>

      <article class="ds-card ds-card--inverse ds-stack--4">
        <span class="ds-label-caps">Como funciona um drop</span>
        <ol class="ds-list-reset ds-stack--4">
          <li
            v-for="(step, index) in DROP_STEPS"
            :key="step.title"
            class="ds-cluster ds-cluster--2 ds-align-start"
          >
            <span class="ds-badge ds-numeric">{{ index + 1 }}</span>
            <span class="ds-stack--1 ds-min-0 ds-grow">
              <strong class="ds-text-medium">{{ step.title }}</strong>
              <span class="ds-text-sm">{{ step.text }}</span>
            </span>
          </li>
        </ol>
      </article>
    </section>

    <section
      class="ds-stack--5"
      aria-labelledby="landing-features"
    >
      <h2
        id="landing-features"
        class="ds-title"
      >
        O que o sistema faz
      </h2>
      <div class="ds-grid ds-grid--3">
        <article
          v-for="feature in FEATURES"
          :key="feature.title"
          class="ds-card ds-stack--3"
        >
          <span :class="['ds-icon-tile', `ds-icon-tile--${feature.tone}`]">
            <component
              :is="feature.icon"
              :size="20"
              :stroke-width="1.5"
              aria-hidden="true"
            />
          </span>
          <h3 class="ds-card__title">
            {{ feature.title }}
          </h3>
          <p class="ds-text-sm ds-text-secondary">
            {{ feature.text }}
          </p>
        </article>
      </div>
    </section>

    <section
      class="ds-stack--5"
      aria-labelledby="landing-access"
    >
      <h2
        id="landing-access"
        class="ds-title"
      >
        Acesse
      </h2>
      <div class="ds-grid ds-grid--2">
        <article class="ds-card ds-stack--4">
          <div class="ds-cluster ds-cluster--2">
            <span class="ds-icon-tile">
              <UserRound
                :size="20"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </span>
            <h3 class="ds-card__title">
              Sou cliente
            </h3>
          </div>
          <p class="ds-text-sm ds-text-secondary">
            Inscreva-se em drops, entre na fila, compre na vitrine e acompanhe seus pedidos.
          </p>
          <div class="ds-cluster ds-cluster--2">
            <a
              class="ds-btn ds-btn--primary"
              :href="href('/entrar')"
            >
              Entrar
            </a>
            <a
              class="ds-btn ds-btn--secondary"
              :href="href('/criar-conta')"
            >
              Criar conta
            </a>
          </div>
        </article>

        <article
          v-if="ADMIN_ENABLED"
          class="ds-card ds-stack--4"
        >
          <div class="ds-cluster ds-cluster--2">
            <span class="ds-icon-tile">
              <Store
                :size="20"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </span>
            <h3 class="ds-card__title">
              Sou lojista
            </h3>
          </div>
          <p class="ds-text-sm ds-text-secondary">
            Acesso da equipe da loja: vendas, drops, catálogo, pedidos e configurações. O login é separado do login de cliente.
          </p>
          <div class="ds-cluster ds-cluster--2">
            <a
              class="ds-btn ds-btn--secondary"
              :href="href('/admin')"
            >
              Entrar no painel
              <ArrowRight
                class="ds-btn__icon"
                :size="16"
                :stroke-width="1.5"
                aria-hidden="true"
              />
            </a>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
