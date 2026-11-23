#!/usr/bin/perl
# Da giornalieri.csv ricava, per ogni mese e codice, l'ultima quotazione (per data_fonte).
# Uso: fine-mese.pl <giornalieri.csv> <fine-mese.csv>
use strict; use warnings;
my ($in, $out) = @ARGV;
open my $fh, '<', $in or die "$in: $!"; <$fh>;
my %u;
while (<$fh>) { s/\r?\n$//; my ($dl,$df,$cod,$pr) = split /;/; next unless $df && $cod && $pr ne '';
  my $m = substr($df, 0, 7); my $k = "$m;$cod";
  $u{$k} = [$pr, $df] if !$u{$k} || $df ge $u{$k}[1]; }
open my $o, '>', $out or die "$out: $!"; print $o "mese;codice;prezzo;data_fonte\n";
print $o "$_;$u{$_}[0];$u{$_}[1]\n" for sort keys %u;
