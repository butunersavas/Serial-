const monthlyData = [
  { ay: "Ocak", planlanan: 481032.7, gerceklesen: 210250.5 },
  { ay: "Şubat", planlanan: 2186295.7, gerceklesen: 1690320.1 },
  { ay: "Mart", planlanan: 324680.7, gerceklesen: 305100.2 },
  { ay: "Nisan", planlanan: 406930.7, gerceklesen: 390250.9 },
  { ay: "Mayıs", planlanan: 246246.7, gerceklesen: 298412.4 },
  { ay: "Haziran", planlanan: 979367.7, gerceklesen: 830542.6 },
  { ay: "Temmuz", planlanan: 578887.7, gerceklesen: 522814.1 },
  { ay: "Ağustos", planlanan: 445512.7, gerceklesen: 460113.5 },
  { ay: "Eylül", planlanan: 530597.7, gerceklesen: 480002.4 },
  { ay: "Ekim", planlanan: 462472.7, gerceklesen: 428114.2 },
  { ay: "Kasım", planlanan: 360722.7, gerceklesen: 315422.2 },
  { ay: "Aralık", planlanan: 372222.7, gerceklesen: 330889.8 }
];

const warningItems = [
  { ad: "Güvenlik Ürünleri", departman: "Sistem" },
  { ad: "Disaster Felaket Kurtarma (12 Ay)", departman: "Sistem" },
  { ad: "Dış Kaynak Yazılım Geliştirme Kod Transferi", departman: "Sistem" },
  { ad: "Dış Kaynak Yazılım Geliştirme Bakım", departman: "Sistem" },
  { ad: "Veri Merkezi Barındırma + Enerji Gideri (12 Ay)", departman: "Sistem" },
  { ad: "Satış CRM Lisansları", departman: "Satış" },
  { ad: "İK Eğitim ve Sertifikasyon", departman: "İnsan Kaynakları" }
];

const currency = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "USD" });


function drawLegendItem(ctx, x, y, color, label) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 8, 12, 12);
  ctx.fillStyle = "#1a2233";
  ctx.fillText(label, x + 18, y + 2);
}

function drawChart() {
  const canvas = document.getElementById("trendChart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;

  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = cssWidth;
  const height = cssHeight;
  const padding = { top: 38, right: 24, bottom: 52, left: 72 };

  const chartData = monthlyData.map((month) => {
    const kalan = Math.max(month.planlanan - month.gerceklesen, 0);
    const asim = Math.max(month.gerceklesen - month.planlanan, 0);
    return {
      ay: month.ay,
      planlanan: month.planlanan,
      gerceklesen: month.gerceklesen,
      kalan,
      asim
    };
  });

  const metricKeys = ["planlanan", "gerceklesen", "kalan", "asim"];
  const metricColors = {
    planlanan: "#3f6cc0",
    gerceklesen: "#f08a34",
    kalan: "#9ea3aa",
    asim: "#f3c74d"
  };

  const maxValue = Math.max(...chartData.flatMap((m) => metricKeys.map((k) => m[k])), 1) * 1.1;

  ctx.clearRect(0, 0, width, height);
  ctx.font = "12px Inter, Arial";

  const chartTop = padding.top;
  const chartBottom = height - padding.bottom;
  const chartLeft = padding.left;
  const chartRight = width - padding.right;
  const chartHeight = chartBottom - chartTop;
  const chartWidth = chartRight - chartLeft;

  for (let i = 0; i <= 5; i += 1) {
    const y = chartTop + (chartHeight * i) / 5;
    ctx.strokeStyle = "#e4eaf7";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();

    const value = maxValue * (1 - i / 5);
    ctx.fillStyle = "#60708f";
    ctx.fillText(currency.format(value), 8, y + 4);
  }

  const groupWidth = chartWidth / chartData.length;
  const barAreaWidth = groupWidth * 0.72;
  const barWidth = barAreaWidth / metricKeys.length;

  chartData.forEach((month, index) => {
    const groupStart = chartLeft + index * groupWidth + (groupWidth - barAreaWidth) / 2;

    metricKeys.forEach((key, barIndex) => {
      const value = month[key];
      const barHeight = (value / maxValue) * chartHeight;
      const x = groupStart + barIndex * barWidth;
      const y = chartBottom - barHeight;

      ctx.fillStyle = metricColors[key];
      ctx.fillRect(x, y, barWidth - 2, barHeight);
    });

    ctx.fillStyle = "#60708f";
    ctx.fillText(month.ay, groupStart + barAreaWidth / 2 - 18, chartBottom + 18);
  });

  drawLegendItem(ctx, chartLeft + 8, 20, metricColors.planlanan, "Planlanan");
  drawLegendItem(ctx, chartLeft + 118, 20, metricColors.gerceklesen, "Gerçekleşen");
  drawLegendItem(ctx, chartLeft + 236, 20, metricColors.kalan, "Kalan");
  drawLegendItem(ctx, chartLeft + 308, 20, metricColors.asim, "Aşım");
}

function renderWarningItems(selectedDepartment = "Tümü") {
  const list = document.getElementById("itemList");
  const filtered =
    selectedDepartment === "Tümü"
      ? warningItems
      : warningItems.filter((item) => item.departman === selectedDepartment);

  list.innerHTML = filtered
    .map(
      (item) => `
      <li>
        <div>
          <strong>${item.ad}</strong>
          <div class="item-meta">Departman: ${item.departman}</div>
        </div>
        <input type="checkbox" aria-label="${item.ad}" />
      </li>
    `
    )
    .join("");
}

function setupWarningModal() {
  const modal = document.getElementById("warningModal");
  const closeBtn = document.getElementById("closeModal");
  const departmentSelect = document.getElementById("departmentSelect");
  const departments = ["Tümü", ...new Set(warningItems.map((item) => item.departman))];

  departmentSelect.innerHTML = departments.map((dep) => `<option value="${dep}">${dep}</option>`).join("");

  departmentSelect.addEventListener("change", (event) => {
    renderWarningItems(event.target.value);
  });

  closeBtn.addEventListener("click", () => {
    modal.classList.remove("show");
  });

  renderWarningItems();

  const expiredCount = 0;
  const soonCount = 0;
  document.getElementById("expiredText").textContent =
    expiredCount === 0 ? "Süresi dolan garanti kaydı bulunmuyor." : `${expiredCount} kayıt bulundu.`;
  document.getElementById("soonText").textContent =
    soonCount === 0 ? "30 gün içinde süresi dolacak garanti kaydı bulunmuyor." : `${soonCount} kayıt bulundu.`;

  // İstenen davranış: dashboard açıldığında ve sayfa yenilemesinde uyarı ekranı tekrar görünmeli.
  modal.classList.add("show");
}

window.addEventListener("DOMContentLoaded", () => {
  setupWarningModal();
  drawChart();
});

window.addEventListener("resize", drawChart);
