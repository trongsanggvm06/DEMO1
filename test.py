import numpy as np
from scipy.integrate import odeint
import matplotlib.pyplot as plt

# Tham số hệ
m = 52000000   # khối lượng kg
c = 4.9 * 10**6  # hệ số cản Ns/s
k = 5.13 * 10**8   # độ cứng lò xo N/m

# Hàm mô tả hệ phương trình vi phân
def model(y, t, m, c, k):
    x1, x2 = y   # x1 = x(t), x2 = x'(t)
    dx1dt = x2
    dx2dt = -(c/m) * x2 - (k/m) * x1
    return [dx1dt, dx2dt]

# Điều kiện ban đầu: x(0) = 1, x'(0) = 0
y0 = [0.03, 0.0]

# Miền thời gian
t = np.linspace(0, 30000, 10000)

# Giải ODE
sol = odeint(model, y0, t, args=(m, c, k))

# Vẽ kết quả
plt.figure(figsize=(10, 5))
plt.plot(t, sol[:, 0], label='x(t) - Vị trí')
plt.plot(t, sol[:, 1], label="x'(t) - Vận tốc", linestyle="--")
plt.xlabel('Thời gian t')
plt.ylabel('Đáp ứng')
plt.title('Giải ODE: m x\'\' + c x\' + k x = 0')
plt.legend()
plt.grid(True)
plt.savefig('ode_solution.png')
plt.show()

